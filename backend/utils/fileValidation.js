// backend/utils/fileValidation.js
const multer = require('multer');
const net = require('net');

// ============================================
// MULTER CONFIGURATION
// ============================================
const MAX_FILE_SIZE = parseInt(process.env.MAX_CSV_FILE_SIZE, 10) || 5 * 1024 * 1024;

const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 20 * 1024 * 1024 // 20MB max for multer
    },
    fileFilter: (req, file, cb) => {
        const ext = file.originalname.split('.').pop().toLowerCase();
        if (ext !== 'csv') {
            return cb(new Error('Only CSV files are allowed'), false);
        }
        cb(null, true);
    }
}).single('file');

// ============================================
// CSV PARSER (RFC 4180 compliant)
// ============================================
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes) {
                const nextChar = line[i + 1];
                if (nextChar === '"') {
                    // Escaped quote
                    current += '"';
                    i++;
                } else if (nextChar === ',' || nextChar === undefined || nextChar === '\r' || nextChar === '\n') {
                    // Closing quote
                    inQuotes = false;
                } else {
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

// ============================================
// SANITIZER (Prevent XSS & Formula Injection)
// ============================================
function sanitizeCSVCell(value) {
    if (typeof value !== 'string') return value;
    
    // Escape XSS vectors
    let sanitized = value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Neutralize formula injection
    if (/^[=+\-@]/.test(sanitized)) {
        sanitized = "'" + sanitized;
    }
    
    return sanitized;
}

// ============================================
// CLAMAV MALWARE SCANNER (Optional)
// ============================================
async function scanWithClamAV(buffer) {
    return new Promise((resolve, reject) => {
        const host = process.env.CLAMAV_HOST || 'localhost';
        const port = parseInt(process.env.CLAMAV_PORT || '3310', 10);
        
        const socket = new net.Socket();
        socket.setTimeout(5000);
        
        socket.connect(port, host, () => {
            // Send zINSTREAM command
            const prefix = Buffer.from('zINSTREAM\0');
            socket.write(prefix);
            
            // Send chunk size (4 bytes, big endian)
            const sizeBuf = Buffer.alloc(4);
            sizeBuf.writeUInt32BE(buffer.length, 0);
            socket.write(sizeBuf);
            socket.write(buffer);
            
            // Send zero-length chunk to indicate end
            const endBuf = Buffer.alloc(4);
            endBuf.writeUInt32BE(0, 0);
            socket.write(endBuf);
        });
        
        let response = '';
        socket.on('data', (data) => {
            response += data.toString();
        });
        
        socket.on('end', () => {
            resolve(!response.includes('FOUND'));
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

// ============================================
// MAIN VALIDATION MIDDLEWARE
// ============================================
const validateCSVUpload = (req, res, next) => {
    upload(req, res, async (err) => {
        // Handle multer errors
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === "LIMIT_FILE_SIZE") {
                    return res.status(413).json({
                        success: false,
                        error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
                    });
                }
            }
            return res.status(400).json({ 
                success: false, 
                error: err.message 
            });
        }

        // Check if file exists
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No file uploaded' 
            });
        }

        // Custom file size limit check
        if (req.file.size > MAX_FILE_SIZE) {
            return res.status(413).json({
                success: false,
                error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
            });
        }

        const buffer = req.file.buffer;

        // Optional ClamAV Malware Scan
        if (process.env.ENABLE_MALWARE_SCAN === 'true') {
            try {
                const isClean = await scanWithClamAV(buffer);
                if (!isClean) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'File contains malware' 
                    });
                }
            } catch (scanError) {
                console.error('Malware scan failed:', scanError);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Malware scan service unavailable' 
                });
            }
        }

        // Parse CSV content
        const fileContent = buffer.toString('utf-8');
        if (!fileContent.trim()) {
            return res.status(400).json({ 
                success: false, 
                error: 'CSV file is empty' 
            });
        }

        const lines = fileContent.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'CSV file is empty' 
            });
        }

        // Row limit check
        const maxRows = parseInt(process.env.MAX_CSV_ROWS, 10) || 100000;
        if (lines.length - 1 > maxRows) {
            return res.status(413).json({
                success: false,
                error: `File too large (too many rows). Maximum is ${maxRows} rows`
            });
        }

        // Parse headers
        const rawHeaders = parseCSVLine(lines[0]);
        const normalizedHeaders = rawHeaders.map(h => h.trim().toLowerCase());

        // Must contain "text" or "message" column
        const hasText = normalizedHeaders.includes('text') || normalizedHeaders.includes('message');
        if (!hasText) {
            return res.status(400).json({
                success: false,
                error: 'Invalid CSV format',
                errors: ['CSV file must contain a "text" or "message" column']
            });
        }

        // Parse and sanitize rows
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const parsedLine = parseCSVLine(lines[i]);
            const rowObj = {};
            rawHeaders.forEach((header, index) => {
                const val = parsedLine[index] !== undefined ? parsedLine[index] : '';
                rowObj[header.trim()] = sanitizeCSVCell(val);
            });
            rows.push(rowObj);

            // Yield to event loop every 500 rows
            if (i % 500 === 0) {
                await new Promise(resolve => setImmediate(resolve));
            }
        }

        // Attach parsed data to request
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

// ============================================
// EXPORTS
// ============================================
module.exports = {
    parseCSVLine,
    sanitizeCSVCell,
    scanWithClamAV,
    validateCSVUpload,
    MAX_FILE_SIZE
};