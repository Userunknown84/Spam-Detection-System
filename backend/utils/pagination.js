const getPaginationParams = (query, defaultLimit = 10, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = parseInt(query.limit, 10) || defaultLimit;
  const safeLimit = Math.min(limit, maxLimit);
  const skip = (page - 1) * safeLimit;

  return { page, safeLimit, skip };
};

module.exports = { getPaginationParams };