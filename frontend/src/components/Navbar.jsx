import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const Navbar = () => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        fetchCount();
    }, []);

    const fetchCount = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            const res = await axios.get('/api/history/count', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCount(res.data.count);
        } catch (error) {
            console.error('Failed to fetch count:', error);
        }
    };

    return (
        <nav>
            <Link to="/history" style={{ position: 'relative' }}>
                📜 History
                {count > 0 && (
                    <span style={{
                        position: 'absolute',
                        top: '-8px',
                        right: '-15px',
                        background: '#3b82f6',
                        color: 'white',
                        borderRadius: '50%',
                        padding: '2px 6px',
                        fontSize: '10px',
                        fontWeight: 'bold'
                    }}>
                        {count}
                    </span>
                )}
            </Link>
        </nav>
    );
};

export default Navbar;