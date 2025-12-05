const BASE_URL = "";

async function request(path, options = {}) {
  const res = await fetch(BASE_URL + path, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.error) message = data.error;
    } catch (e) {}
    throw new Error(message);
  }

  if (res.status === 204) return null;
  return res.json();
}

// API functions
function getRecipients() {
  return request("/api/recipients");
}

function createRecipient({ address, amount }) {
  return request("/api/recipients", {
    method: "POST",
    body: JSON.stringify({ address, amount }),
  });
}

function deleteRecipient(id) {
  return request(`/api/recipients/${id}`, {
    method: "DELETE",
  });
}

function runPayroll() {
  return request("/api/run-payroll", {
    method: "POST",
  });
}

function getTransactions() {
  return request("/api/transactions");
}

// Export the functions if using modules
export {
  getRecipients,
  createRecipient,
  deleteRecipient,
  runPayroll,
  getTransactions,
};
