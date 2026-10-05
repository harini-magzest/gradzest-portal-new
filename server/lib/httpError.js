// Logs the real error server-side and returns a generic message, so database, SMTP,
// or other internal error text never reaches the client.
function sendServerError(res, err, message = 'Server error') {
  console.error(err);
  res.status(500).json({ message });
}

module.exports = { sendServerError };
