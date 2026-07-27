import { useState, useEffect } from "react";
import api from "../utils/axiosInstance";
import { useTheme } from "../context/ThemeContext";

export default function AdminFeedbackView() {
  const { isDark, activeTheme } = useTheme();
  const [stats, setStats] = useState(null);
  const [feedbackList, setFeedbackList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchStats = async () => {
    try {
      const res = await api.get("/api/v1/feedback/admin/stats");
      setStats(res.data);
    } catch (err) {
      console.error("Failed to fetch admin feedback stats:", err);
      setError("Failed to load feedback stats.");
    }
  };

  const fetchFeedbackList = async (pageNum) => {
    try {
      const res = await api.get(`/api/v1/feedback/admin/list?page=${pageNum}&limit=10`);
      setFeedbackList(res.data.data);
      setTotalPages(res.data.pages);
      setPage(res.data.page);
    } catch (err) {
      console.error("Failed to fetch admin feedback list:", err);
      setError("Failed to load feedback list.");
    }
  };

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchFeedbackList(page)]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchFeedbackList(newPage);
    }
  };

  if (loading) {
    return <div className="p-4 text-center">Loading feedback data...</div>;
  }

  return (
    <div className="text-left w-full mx-auto">
      <h2 className="text-2xl font-extrabold mb-2 flex items-center gap-2 text-purple-500">
        📊 Admin Prediction Feedback
      </h2>
      <p className="text-xs opacity-75 mb-6">
        Review user feedback on spam predictions to identify false positives and false negatives.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 text-red-700 text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
            <h3 className="text-xs font-bold opacity-70 uppercase tracking-wide">Total Feedback</h3>
            <p className="text-2xl font-black mt-1">{stats.totalFeedback}</p>
            <p className="text-xs opacity-60 mt-1">Participation: {stats.participationRate}%</p>
          </div>
          
          <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
            <h3 className="text-xs font-bold opacity-70 uppercase tracking-wide text-green-500">Correctly Predicted</h3>
            <p className="text-2xl font-black mt-1 text-green-500">{stats.correctFeedback}</p>
            <p className="text-xs opacity-60 mt-1">Rate: {stats.correctRate}%</p>
          </div>

          <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
            <h3 className="text-xs font-bold opacity-70 uppercase tracking-wide text-red-500">Incorrectly Predicted</h3>
            <p className="text-2xl font-black mt-1 text-red-500">{stats.incorrectFeedback}</p>
            <p className="text-xs opacity-60 mt-1">Rate: {stats.incorrectRate}%</p>
          </div>

          <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
            <h3 className="text-xs font-bold opacity-70 uppercase tracking-wide text-orange-500">False Positives</h3>
            <p className="text-2xl font-black mt-1 text-orange-500">{stats.falsePositives}</p>
            <p className="text-xs opacity-60 mt-1">Predicted Spam, Actual Ham</p>
          </div>

          <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
            <h3 className="text-xs font-bold opacity-70 uppercase tracking-wide text-yellow-500">False Negatives</h3>
            <p className="text-2xl font-black mt-1 text-yellow-500">{stats.falseNegatives}</p>
            <p className="text-xs opacity-60 mt-1">Predicted Ham, Actual Spam</p>
          </div>
        </div>
      )}

      {/* Feedback Table */}
      <h3 className="text-lg font-bold mb-4">Recent Feedback</h3>
      <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className={`text-xs uppercase bg-opacity-50 ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Query</th>
                <th className="px-4 py-3">Prediction</th>
                <th className="px-4 py-3">Feedback</th>
                <th className="px-4 py-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {feedbackList.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center opacity-70">
                    No feedback found.
                  </td>
                </tr>
              ) : (
                feedbackList.map((item) => (
                  <tr key={item._id} className={`border-b ${isDark ? 'border-slate-800 hover:bg-slate-800/50' : 'border-slate-100 hover:bg-slate-50'}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.feedback?.submittedAt ? new Date(item.feedback.submittedAt).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      {item.user?.name || 'Unknown'} <br/>
                      <span className="text-xs opacity-60">{item.user?.email || ''}</span>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate" title={item.query}>
                      {item.query}
                    </td>
                    <td className="px-4 py-3 font-semibold capitalize">
                      {item.prediction}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        item.feedback?.label === 'correct' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {item.feedback?.label || 'unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs opacity-80 max-w-xs truncate" title={item.feedback?.note}>
                      {item.feedback?.note || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className={`p-4 border-t flex justify-between items-center ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <span className="text-sm opacity-70">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                className="px-3 py-1 rounded border disabled:opacity-50 text-sm hover:bg-opacity-80 transition"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
                className="px-3 py-1 rounded border disabled:opacity-50 text-sm hover:bg-opacity-80 transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
