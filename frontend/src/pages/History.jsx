import React, {useState,useEffect} from 'react';
import axios from 'axios';

const History = () => {
    const[history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType,setFilterType]= useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(()=>{
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try{
            setLoading(true);
            const token=localStorage.getItem('token');
            
            // Build query params
            const params = new URLSearchParams();
            if (searchTerm) params.append('q', searchTerm);
            if (filterType !== 'all') params.append('type', filterType);
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);

            const response = await axios.get(`/api/history/search?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setHistory(response.data.data || []);
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        fetchHistory();
    };

    const clearFilters = () => {
        setSearchTerm('');
        setFilterType('all');
        setStartDate('');
        setEndDate('');
        setTimeout(fetchHistory, 100);
    };
    
   if (loading) {
        return <div style={{ padding: '20px', textAlign: 'center' }}>Loading history...</div>;
    }

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
            <h2>📜 Prediction History</h2>

            {/* Search & Filters */}
            <form onSubmit={handleSearch} style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <input
                        type="text"
                        placeholder="Search messages..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', minWidth: '200px' }}
                    />
                    
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px' }}
                    >
                        <option value="all">All Types</option>
                        <option value="spam">Spam</option>
                        <option value="ham">Ham</option>
                    </select>

                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                    <span style={{ alignSelf: 'center' }}>to</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />

                    <button type="submit" style={{ padding: '8px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                        Search
                    </button>
                    <button type="button" onClick={clearFilters} style={{ padding: '8px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                        Clear
                    </button>
                </div>
            </form>

            {/* Results Count */}
            <div style={{ marginBottom: '10px', color: '#6b7280', fontSize: '14px' }}>
                Found {history.length} results
            </div>

            {/* History List */}
            {history.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                    <p>No history found.</p>
                </div>
            ) : (
                <div>
                    {history.map((item) => (
                        <div key={item._id} style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            padding: '12px 15px',
                            borderBottom: '1px solid #e5e7eb',
                            background: 'white',
                            borderRadius: '6px',
                            marginBottom: '5px'
                        }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '500' }}>{item.query}</div>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                    {new Date(item.createdAt).toLocaleString()}
                                </div>
                            </div>
                            <span style={{ 
                                padding: '4px 12px', 
                                borderRadius: '12px', 
                                fontSize: '12px',
                                fontWeight: '600',
                                background: item.prediction === 'spam' ? '#fee2e2' : '#dcfce7',
                                color: item.prediction === 'spam' ? '#dc2626' : '#16a34a'
                            }}>
                                {item.prediction}
                            </span>
                            {item.confidence && (
                                <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '10px' }}>
                                    {Math.round(item.confidence * 100)}%
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default History;
