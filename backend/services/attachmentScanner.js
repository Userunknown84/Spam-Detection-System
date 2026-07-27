const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class AttachmentScanner {
  constructor() {
    // Suspicious file extensions
    this.suspiciousExtensions = [
      '.exe', '.scr', '.bat', '.cmd', '.com', '.pif',
      '.vbs', '.js', '.jar', '.app', '.msi', '.ps1'
    ];
    
    // Safe file types
    this.safeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'text/csv',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
  }

  scanAttachment(fileBuffer, filename, mimetype) {
    const results = {
      filename,
      mimetype,
      size: fileBuffer.length,
      isSafe: true,
      issues: [],
      riskScore: 0
    };

    // 1. Check file extension
    const ext = path.extname(filename).toLowerCase();
    if (this.suspiciousExtensions.includes(ext)) {
      results.isSafe = false;
      results.issues.push(`Suspicious file extension: ${ext}`);
      results.riskScore += 40;
    }

    // 2. Check file size
    if (fileBuffer.length > 10 * 1024 * 1024) {
      results.issues.push('File size exceeds 10MB limit');
      results.riskScore += 10;
    }

    // 3. Check MIME type mismatch (file extension vs actual type)
    if (mimetype && ext) {
      const isImage = mimetype.startsWith('image/');
      const isDocument = mimetype.startsWith('application/');
      const extIsImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
      const extIsDoc = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv'].includes(ext);
      
      if ((isImage && !extIsImage) || (isDocument && !extIsDoc)) {
        results.issues.push('MIME type mismatch');
        results.riskScore += 25;
      }
    }

    // 4. Check for double extensions (e.g., file.pdf.exe)
    const parts = filename.split('.');
    if (parts.length > 2) {
      const lastExt = parts[parts.length - 1];
      if (this.suspiciousExtensions.includes(`.${lastExt}`)) {
        results.issues.push('Double file extension detected');
        results.riskScore += 30;
      }
    }

    // 5. Check for suspicious content in text files
    if (mimetype === 'text/plain' || ext === '.txt' || ext === '.csv') {
      const content = fileBuffer.toString('utf-8');
      const suspiciousPatterns = [
        /javascript:/i,
        /data:/i,
        /vbscript:/i,
        /eval\(/i,
        /document\.write/i
      ];
      
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(content)) {
          results.issues.push('Suspicious content pattern detected');
          results.riskScore += 20;
          break;
        }
      }
    }

    // 6. Check for macros in Office files
    if (['.doc', '.docm', '.xls', '.xlsm', '.ppt', '.pptm'].includes(ext)) {
      results.issues.push('File may contain macros');
      results.riskScore += 15;
    }

    // Update safe status
    if (results.riskScore > 30) {
      results.isSafe = false;
    }

    return results;
  }
}

module.exports = new AttachmentScanner();