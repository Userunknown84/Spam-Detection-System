import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';


const escapeHTML = (str) => {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};


const History = () => {
    const [history, setHistory] = useState([]);
    const [selectedItems, setSelectedItems] = useState([]);
    const [sortOrder, setSortOrder] = useState('newest');
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    const sortedHistory = [...history].sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

const fetchHistory = async () => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('/api/history', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setHistory(res.data.data || []);
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Delete ${selectedItems.length} item(s)?`)) return;

        try {
            const token = localStorage.getItem('token');
            await axios.delete('/api/history/bulk-delete', {
                headers: { Authorization: `Bearer ${token}` },
                data: { ids: selectedItems }
            });
            setSelectedItems([]);
            fetchHistory();
        } catch {
            alert('Failed to delete items');
        }
    };

    const toggleSelect = (id) => {
        setSelectedItems(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleClearAll = async () => {
        if (!confirm('Are you sure you want to permanently delete ALL history?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete('/api/history', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSelectedItems([]);
            fetchHistory();
        } catch {
            alert('Failed to clear history');
        }
    };

    const handleExportCSV = () => {
        if (history.length === 0) return;
        
        const headers = ["Query", "Prediction", "Date"];
        const rows = history.map(item => {
            const date = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
            const safeQuery = (item.query || '').replace(/"/g, '""');
            return `"${safeQuery}","${item.prediction}","${date}"`;
        });
        
        const csvContent = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "scan_history.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportPDF = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get('/api/reports/export-pdf', {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob', // Important for handling binary data
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'spam_detection_report.pdf');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error downloading PDF:', error);
            alert('Failed to download PDF report');
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0 }}>History</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            background: '#f9fafb',
                            cursor: 'pointer',
                            fontWeight: '500'
                        }}
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                    </select>
                    <button 
                        onClick={handleExportCSV}
                        disabled={history.length === 0}
                        style={{
                            background: history.length === 0 ? '#9ca3af' : '#3b82f6',
                            color: 'white',
                            padding: '8px 16px',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: history.length === 0 ? 'not-allowed' : 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        Download CSV
                    </button>
                    <button 
                        onClick={handleExportPDF}
                        style={{
                            background: '#10b981',
                            color: 'white',
                            padding: '8px 16px',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        Export as PDF
                    </button>
                    <button 
                        onClick={handleClearAll}
                        disabled={history.length === 0}
                        style={{
                            background: history.length === 0 ? '#fca5a5' : '#ef4444',
                            color: 'white',
                            padding: '8px 16px',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: history.length === 0 ? 'not-allowed' : 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        Clear All
                    </button>
                </div>
            </div>

            {selectedItems.length > 0 && (
                <button
                    onClick={handleBulkDelete}
                    style={{
                        background: '#ef4444',
                        color: 'white',
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        marginBottom: '10px'
                    }}
                >
                    Delete Selected ({selectedItems.length})
                </button>
            )}

            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ 
                        border: '4px solid #f3f3f3', 
                        borderTop: '4px solid #3b82f6', 
                        borderRadius: '50%', 
                        width: '40px', 
                        height: '40px', 
                        animation: 'spin 1s linear infinite', 
                        margin: '0 auto 16px' 
                    }} />
                    <p style={{ color: '#6b7280', fontWeight: '500' }}>Loading history...</p>
                    <style>
                        {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
                    </style>
                </div>
            ) : history.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: '#f9fafb', borderRadius: '12px', border: '2px dashed #e5e7eb', marginTop: '20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
                    <h3 style={{ margin: '0 0 8px 0', color: '#374151', fontSize: '20px' }}>No scan history yet</h3>
                    <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>It looks like you haven't scanned any messages or emails.</p>
                    <button 
                        onClick={() => navigate('/dashboard')}
                        style={{
                            background: '#3b82f6',
                            color: 'white',
                            padding: '10px 20px',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => e.target.style.background = '#2563eb'}
                        onMouseOut={(e) => e.target.style.background = '#3b82f6'}
                    >
                        Go to Dashboard
                    </button>
                </div>
            ) : (
                sortedHistory.map(item => (
                    <div
                        key={item._id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 0',
                            borderBottom: '1px solid #e5e7eb'
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={selectedItems.includes(item._id)}
                            onChange={() => toggleSelect(item._id)}
                        />
                        <span style={{ flex: 1 }}>{escapeHTML(item.query)}</span>
                        {item.confidence != null && (
                            <div style={{ display: 'flex', alignItems: 'center', width: '120px', marginRight: '10px' }}>
                                <div style={{ 
                                    flex: 1, 
                                    height: '6px', 
                                    background: '#e5e7eb', 
                                    borderRadius: '3px',
                                    overflow: 'hidden',
                                    marginRight: '8px'
                                }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${Math.min(item.confidence * 50 + 50, 100)}%`,
                                        background: item.prediction === 'spam' || item.prediction === 'malicious' 
                                            ? '#ef4444' 
                                            : item.prediction === 'smishing' 
                                                ? '#f97316' 
                                                : '#22c55e'
                                    }} />
                                </div>
                                <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: '500', width: '30px', textAlign: 'right' }}>
                                    {Math.min(item.confidence * 50 + 50, 100).toFixed(0)}%
                                </span>
                            </div>
                        )}
                        <span
                            style={{
                                padding: '2px 10px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: '600',
                                background: item.prediction === 'spam' ? '#fee2e2' : '#dcfce7',
                                color: item.prediction === 'spam' ? '#dc2626' : '#16a34a'
                            }}
                        >
                            {item.prediction}
                        </span>
                    </div>
                ))
            )}
        </div>
    );
};

export default History;