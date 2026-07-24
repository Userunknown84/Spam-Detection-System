const multer = require('multer');
const net = require('net');


function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes) {
                const nextChar = line[i + 1];
                const charAfterNext = line[i + 2];
                if (nextChar === '"' && charAfterNext !== ',' && charAfterNext !== undefined && charAfterNext !== '\r' && charAfterNext !== '\n') {
                    // It is an escaped quote
                    current += '"';
                    i++;
                } else if (nextChar === ',' || nextChar === undefined || nextChar === '\r' || nextChar === '\n') {
                    // Closes the field
                    inQuotes = false;
                } else {
                    // Literal quote
                    current += '"';
                }
            } else {
                if (current === '') {
                    inQuotes = true;
                } else {
                    current += '"';
                }
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

/**
 * Sanitizes a CSV cell value to prevent XSS and CSV Formula Injection attacks.
 * @param {any} value 
 * @returns {any}
 */
function sanitizeCSVCell(value) {
    if (typeof value !== 'string') return value;
    
    // Escape basic XSS vectors (specifically < and >)
    let sanitized = value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Neutralize formula injection: if starts with =, +, -, @, prefix with '
    if (/^[=\+\-@]/.test(sanitized)) {
        sanitized = "'" + sanitized;
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
    
    return sanitized;
}

/**
 * Scan buffer for malware via ClamAV (optional TCP interface)
 * @param {Buffer} buffer 
 * @returns {Promise<boolean>} Resolves to true if clean, false if infected/malware
 */
async function scanWithClamAV(buffer) {
    return new Promise((resolve, reject) => {
        const host = process.env.CLAMAV_HOST || 'localhost';
        const port = parseInt(process.env.CLAMAV_PORT || '3310', 10);
        
        const socket = new net.Socket();
        socket.setTimeout(5000);
        
        socket.connect(port, host, () => {
            // Send zINSTREAM command (modern ClamAV null-terminated command prefix)
            const prefix = Buffer.from('zINSTREAM\0');
            socket.write(prefix);
            
            // Send chunk size (4 bytes, big endian) followed by chunk data
            const sizeBuf = Buffer.alloc(4);
            sizeBuf.writeUInt32BE(buffer.length, 0);
            socket.write(sizeBuf);
            socket.write(buffer);
            
            // Send zero-length chunk to indicate end of stream
            const endBuf = Buffer.alloc(4);
            endBuf.writeUInt32BE(0, 0);
            socket.write(endBuf);
        });
        
        let response = '';
        socket.on('data', (data) => {
            response += data.toString();
        });
        
        socket.on('end', () => {
            if (response.includes('FOUND')) {
                resolve(false); // Malware found
            } else {
                resolve(true); // Clean
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
        
        socket.on('error', (err) => {
            reject(err);
        });
        
        socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('ClamAV scan timeout'));
        });
    });
}

// Multer in-memory storage config with size limits
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 20 * 1024 * 1024 // Set slightly higher to let middleware handle custom size limit logic and error codes
    },
    fileFilter: (req, file, cb) => {
        const fileExtension = file.originalname.split('.').pop().toLowerCase();
        if (fileExtension !== 'csv') {
            return cb(new Error('Only CSV files are allowed'), false);
        }
        cb(null, true);
    }
}).single('file');

/**
 * Express middleware to validate and sanitize uploaded CSV files.
 */
const validateCSVUpload = (req, res, next) => {
    upload(req, res, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'File too large' });
            }
            return res.status(400).json({ error: err.message });
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

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Custom file size limit check from env
        const maxFileSize = parseInt(process.env.MAX_CSV_FILE_SIZE, 10) || 5 * 1024 * 1024;
        if (req.file.size > maxFileSize) {
            return res.status(413).json({ error: 'File too large' });
        }
const validateCSVUpload = async (req, res, next) => {
    try {
        // Use multer to handle file upload
        upload.single('file')(req, res, async (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    if (err.code === "LIMIT_FILE_SIZE") {
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

        const buffer = req.file.buffer;

        // Optional ClamAV Malware Scan
        if (process.env.ENABLE_MALWARE_SCAN === 'true') {
            try {
                const isClean = await scanWithClamAV(buffer);
                if (!isClean) {
                    return res.status(400).json({ error: 'File contains malware' });
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
            } catch (scanError) {
                console.error('Malware scan failed:', scanError);
                return res.status(500).json({ error: 'Malware scan service unavailable' });
            }
        }

        const fileContent = buffer.toString('utf-8');
        if (!fileContent.trim()) {
            return res.status(400).json({ error: 'CSV file is empty' });
        }

        const lines = fileContent.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) {
            return res.status(400).json({ error: 'CSV file is empty' });
        }

        // Custom row count limit check from env
        const maxRows = parseInt(process.env.MAX_CSV_ROWS, 10) || 100000;
        if (lines.length - 1 > maxRows) {
            return res.status(413).json({ error: 'File too large (too many rows)' });
        }

        // Parse headers and normalize/trim
        const rawHeaders = parseCSVLine(lines[0]);
        const normalizedHeaders = rawHeaders.map(h => h.trim().toLowerCase());

        // Must contain "text" or "message" column
        const hasText = normalizedHeaders.includes('text') || normalizedHeaders.includes('message');
        if (!hasText) {
            return res.status(400).json({
                error: 'Invalid CSV format',
                errors: ['CSV file must contain a "text" or "message" column']
            });
        }

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const parsedLine = parseCSVLine(lines[i]);
            const rowObj = {};
            rawHeaders.forEach((header, index) => {
                const val = parsedLine[index] !== undefined ? parsedLine[index] : '';
                // Store sanitized values in the row object keyed by the parsed header
                rowObj[header.trim()] = sanitizeCSVCell(val);
            });
            rows.push(rowObj);

            // Yield to the event loop every 500 rows to prevent blocking (DoS)
            if (i % 500 === 0) {
                await new Promise(resolve => setImmediate(resolve));
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
        }
    }

    values.push(current.trim());
    return values;
}

        req.parsedCSV = {
            headers: rawHeaders.map(h => h.trim()),
            rows: rows,
            totalRows: rows.length,
            filename: req.file.originalname,
            size: req.file.size
        };

        next();
    });
};

module.exports = {
    parseCSVLine,
    sanitizeCSVCell,
    validateCSVUpload
};
