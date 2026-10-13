const describeError = error => {
  if (error && typeof error.message === 'string' && error.message) return error.message;

  if (error !== null && error !== undefined) {
    const text = String(error);
    if (text && text !== '[object Object]') return text;
  }

  return 'Unknown error';
};

module.exports = { describeError };
