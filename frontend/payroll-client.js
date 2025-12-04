class PayrollApiClient {
  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  async _request(path, options = {}) {
    const res = await fetch(this.baseUrl + path, {
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    });
    if (!res.ok) {
      let message = `Request failed with status ${res.status}`;
      try {
        const data = await res.json();
        if (data && data.error) {
          message = data.error;
        }
      } catch (e) {}
      throw new Error(message);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  getRecipients() {
    return this._request("/api/recipients");
  }

  createRecipient({ address, amount }) {
    return this._request("/api/recipients", {
      method: "POST",
      body: JSON.stringify({ address, amount }),
    });
  }

  deleteRecipient(id) {
    return this._request(`/api/recipients/${id}`, {
      method: "DELETE",
    });
  }

  runPayroll() {
    return this._request("/api/run-payroll", {
      method: "POST",
    });
  }

  getTransactions() {
    return this._request("/api/transactions");
  }
}


