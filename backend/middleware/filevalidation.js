const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ============================================
// CONFIGURATION
// ============================================

const MAX_FILE_SIZE = parseInt(process.env.MAX_CSV_FILE_SIZE) || 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/csv',
    'text/plain'
];
const ALLOWED_EXTENSIONS = ['.csv', '.txt'];
const MAX_ROWS = parseInt(process.env.MAX_CSV_ROWS) || 100000; // 100k rows max

// ============================================
// MULTER CONFIGURATION
// ============================================

const storage = multer.memoryStorage(); // Store in memory for processing

const fileFilter = (req, file, cb) => {
    // Check MIME type
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        // Check extension as fallback
        const ext = path.extname(file.originalname).toLowerCase();
        if (ALLOWED_EXTENSIONS.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type. Only CSV files are allowed. Received: ${file.mimetype}`), false);
        }
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1 // Only 1 file at a time
    },
    fileFilter: fileFilter
});

// ============================================
// CSV CONTENT SANITIZATION
// ============================================

/**
 * Sanitize CSV cell content to prevent formula injection
 */
function sanitizeCSVCell(cell) {
    if (!cell || typeof cell !== 'string') {
        return cell;
    }

    const trimmed = cell.trim();
    
    // Dangerous patterns that could indicate formula injection
    const dangerousPatterns = [
        /^=.*/i,        // Excel formulas
        /^\+.*/i,       // Excel formulas
        /^@.*/i,        // Excel formulas
        /^-\s*.*/i,     // Excel formulas
        /^=cmd\|.*/i,   // Command execution
        /^=hyperlink\(.*\)/i, // Hyperlink injection
        /^=dde\(.*\)/i, // DDE execution
        /^=system\(.*\)/i, // System command
        /^=shell\(.*\)/i, // Shell command
        /^=execute\(.*\)/i, // Execute command
        /^=run\(.*\)/i, // Run command
        /\b(calc|cmd|powershell|bash|sh)\b/i // System commands
    ];

    // Check if cell starts with dangerous pattern
    for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmed)) {
            // Prefix with single quote to neutralize formula
            return `'${trimmed}`;
        }
    }

    // Check for potential XSS in CSV (if rendered as HTML)
    const xssPatterns = [
        /<script.*?>.*?<\/script>/i,
        /<iframe.*?>/i,
        /<object.*?>/i,
        /<embed.*?>/i,
        /<link.*?>/i,
        /<meta.*?>/i,
        /on\w+\s*=/i,
        /javascript:/i,
        /vbscript:/i,
        /data:/i
    ];

    for (const pattern of xssPatterns) {
        if (pattern.test(cell)) {
            // Escape HTML entities
            return cell
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;');
        }
    }

    return cell;
}

/**
 * Validate CSV structure and content
 */
function validateCSVContent(rows, headers) {
    const errors = [];

    // Check if CSV is empty
    if (!rows || rows.length === 0) {
        errors.push('CSV file is empty');
    }

    // Check row count limit
    if (rows.length > MAX_ROWS) {
        errors.push(`CSV file exceeds maximum row limit of ${MAX_ROWS}`);
    }

    // Check if required columns exist
    const requiredColumns = ['text', 'message'];
    const hasRequiredColumn = requiredColumns.some(col => 
        headers.some(h => h.toLowerCase().trim() === col.toLowerCase().trim())
    );

    if (!hasRequiredColumn) {
        errors.push(`CSV must contain a 'text' or 'message' column. Found: ${headers.join(', ')}`);
    }

    // Check for empty rows
    const emptyRows = rows.filter(row => {
        const values = Object.values(row);
        return values.every(val => !val || val.trim() === '');
    });

    if (emptyRows.length > 0) {
        errors.push(`Found ${emptyRows.length} empty rows in CSV`);
    }

    // Check for very large cell values
    const maxCellLength = 10000; // 10k characters
    rows.forEach((row, index) => {
        Object.values(row).forEach(value => {
            if (value && value.length > maxCellLength) {
                errors.push(`Row ${index + 1} contains a cell exceeding ${maxCellLength} characters`);
            }
        });
    });

    return errors;
}

// ============================================
// MALWARE SCANNING (Optional - ClamAV)
// ============================================

/**
 * Scan file content for malware using ClamAV
 * Requires clamd package: npm install clamdjs
 */
async function scanForMalware(fileBuffer, filename) {
    try {
        // Check if ClamAV is available
        const clamd = require('clamdjs');
        const scanner = clamd.createScanner('localhost', 3310);
        
        const result = await scanner.scanBuffer(fileBuffer);
        
        if (result.isInfected) {
            throw new Error(`Malware detected: ${result.virusName}`);
        }
        
        return { clean: true };
    } catch (error) {
        // If ClamAV is not available, log warning but don't block
        if (error.code === 'ECONNREFUSED') {
            console.warn('⚠️  ClamAV not available - skipping malware scan');
            return { clean: true, warning: 'ClamAV not available' };
        }
        throw error;
    }
}

// ============================================
// MAIN FILE VALIDATION MIDDLEWARE
// ============================================

const validateCSVUpload = async (req, res, next) => {
    try {
        // Use multer to handle file upload
        upload.single('file')(req, res, async (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === 'FILE_TOO_LARGE') {
                        return res.status(413).json({
                            success: false,
                            error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
                        });
                    }
                    if (err.code === 'LIMIT_FILE_COUNT') {
                        return res.status(400).json({
                            success: false,
                            error: 'Only one file can be uploaded at a time'
                        });
                    }
                    return res.status(400).json({
                        success: false,
                        error: `Upload error: ${err.message}`
                    });
                }
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }

            // Check if file was uploaded
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No file uploaded'
                });
            }

            try {
                // 1. Validate file type (already done by multer)
                const fileExt = path.extname(req.file.originalname).toLowerCase();
                if (!ALLOWED_EXTENSIONS.includes(fileExt) && 
                    !ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
                    return res.status(400).json({
                        success: false,
                        error: `Invalid file type. Only CSV files are allowed. Received: ${req.file.mimetype}`
                    });
                }

                // 2. Optional: Scan for malware
                if (process.env.ENABLE_MALWARE_SCAN === 'true') {
                    try {
                        await scanForMalware(req.file.buffer, req.file.originalname);
                    } catch (scanError) {
                        return res.status(400).json({
                            success: false,
                            error: `Security scan failed: ${scanError.message}`
                        });
                    }
                }

                // 3. Parse CSV content
                const csvContent = req.file.buffer.toString('utf8');
                
                // Basic CSV parsing (handle quoted fields)
                const lines = csvContent.split('\n').filter(line => line.trim());
                if (lines.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'CSV file is empty'
                    });
                }

                // Parse headers
                const headers = parseCSVLine(lines[0]);
                if (headers.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid CSV headers'
                    });
                }

                // Parse rows and sanitize
                const rows = [];
                const validationErrors = [];

                for (let i = 1; i < lines.length; i++) {
                    const values = parseCSVLine(lines[i]);
                    const row = {};
                    
                    headers.forEach((header, index) => {
                        const value = values[index] || '';
                        // Sanitize each cell
                        row[header] = sanitizeCSVCell(value);
                    });
                    
                    rows.push(row);
                }

                // 4. Validate CSV structure
                const validationResults = validateCSVContent(rows, headers);
                if (validationResults.length > 0) {
                    return res.status(400).json({
                        success: false,
                        errors: validationResults
                    });
                }

                // 5. Attach parsed data to request
                req.parsedCSV = {
                    headers: headers,
                    rows: rows,
                    totalRows: rows.length,
                    filename: req.file.originalname,
                    size: req.file.size
                };

                next();

            } catch (parseError) {
                return res.status(400).json({
                    success: false,
                    error: `Failed to parse CSV: ${parseError.message}`
                });
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: `Server error: ${error.message}`
        });
    }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    values.push(current.trim());
    return values;
}

/**
 * Generate unique filename for uploaded files
 */
function generateUniqueFilename(originalName) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(originalName);
    return `csv_${timestamp}_${random}${ext}`;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    upload,
    validateCSVUpload,
    sanitizeCSVCell,
    validateCSVContent,
    scanForMalware,
    MAX_FILE_SIZE,
    ALLOWED_MIME_TYPES,
    ALLOWED_EXTENSIONS,
    MAX_ROWS,
    parseCSVLine,
    generateUniqueFilename
};