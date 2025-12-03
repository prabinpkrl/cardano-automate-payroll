// Frontend client code to interact with backend and Lace wallet
// This runs in the BROWSER and should NOT use cardano-serialization-lib

const API_BASE_URL = "http://localhost:3000/api";

class CardanoClient {
  constructor() {
    this.walletApi = null;
    this.walletAddress = null;
  }

  // Connect to Lace wallet
  async connectWallet() {
    try {
      if (!window.cardano?.lace) {
        throw new Error(
          "Lace wallet not found. Please install Lace extension."
        );
      }

      console.log("Requesting wallet access...");
      // Request wallet access
      this.walletApi = await window.cardano.lace.enable();

      // Get network ID
      const networkId = await this.walletApi.getNetworkId();
      console.log("Network ID:", networkId);

      if (networkId !== 0) {
        throw new Error("Please switch to Preprod testnet in your Lace wallet");
      }

      // Get change address (in hex format)
      const changeAddressHex = await this.walletApi.getChangeAddress();
      console.log("Change address (hex):", changeAddressHex);

      // Convert hex to Bech32 via backend
      console.log("Converting address to Bech32...");
      const conversionResponse = await fetch(
        `${API_BASE_URL}/convert-address`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            hexAddress: changeAddressHex,
          }),
        }
      );

      const conversionData = await conversionResponse.json();

      if (!conversionData.success) {
        throw new Error("Failed to convert address: " + conversionData.error);
      }

      this.walletAddress = conversionData.bech32Address;
      console.log("Wallet address (Bech32):", this.walletAddress);

      return {
        success: true,
        address: this.walletAddress,
      };
    } catch (error) {
      console.error("Wallet connection error:", error);
      throw error;
    }
  }

  // Get wallet balance from backend
  async getBalance() {
    try {
      if (!this.walletAddress) {
        throw new Error("Wallet not connected");
      }

      console.log("Fetching balance for:", this.walletAddress);
      const response = await fetch(
        `${API_BASE_URL}/address/${this.walletAddress}`
      );
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      return data.data;
    } catch (error) {
      console.error("Get balance error:", error);
      throw error;
    }
  }

  // Build transaction via backend
  async buildTransaction(recipientAddress, amountAda) {
    try {
      if (!this.walletAddress) {
        throw new Error("Wallet not connected");
      }

      console.log("Building transaction via backend...");
      console.log("Sender:", this.walletAddress);
      console.log("Recipient:", recipientAddress);
      console.log("Amount:", amountAda, "ADA");

      const response = await fetch(`${API_BASE_URL}/build-transaction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          senderAddress: this.walletAddress,
          recipientAddress: recipientAddress,
          amountAda: amountAda,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      console.log("Transaction built successfully");
      console.log("Fee:", data.data.fee, "lovelace");

      return data.data;
    } catch (error) {
      console.error("Build transaction error:", error);
      throw error;
    }
  }

  // Sign transaction with Lace wallet
  async signTransaction(txHex) {
    try {
      if (!this.walletApi) {
        throw new Error("Wallet not connected");
      }

      console.log("Requesting signature from Lace wallet...");
      console.log(
        "Transaction hex to sign:",
        txHex ? txHex.substring(0, 50) + "..." : "MISSING"
      );
      console.log("Transaction hex length:", txHex ? txHex.length : 0);

      if (!txHex) {
        throw new Error("Transaction hex is missing or empty");
      }

      // Sign the transaction with partial sign = false (complete signing)
      const witnessSetHex = await this.walletApi.signTx(txHex, false);

      console.log("Transaction signed successfully");
      console.log(
        "Witness set hex:",
        witnessSetHex ? witnessSetHex.substring(0, 50) + "..." : "MISSING"
      );
      console.log(
        "Witness set hex length:",
        witnessSetHex ? witnessSetHex.length : 0
      );

      if (!witnessSetHex) {
        throw new Error("Wallet returned empty witness set");
      }

      return witnessSetHex;
    } catch (error) {
      console.error("Sign transaction error:", error);
      throw error;
    }
  }

  // Submit signed transaction via backend
  async submitTransaction(signedTxHex, originalTxHex) {
    try {
      console.log("Submitting transaction to blockchain...");
      console.log(
        "signedTxHex:",
        signedTxHex ? signedTxHex.substring(0, 50) + "..." : "MISSING"
      );
      console.log(
        "originalTxHex:",
        originalTxHex ? originalTxHex.substring(0, 50) + "..." : "MISSING"
      );

      const payload = {
        signedTxHex: signedTxHex,
        txHex: originalTxHex,
      };

      console.log("Payload:", JSON.stringify(payload).substring(0, 200));

      const response = await fetch(`${API_BASE_URL}/submit-transaction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      console.log("Transaction submitted successfully");
      console.log("TxHash:", data.data.txHash);

      return data.data;
    } catch (error) {
      console.error("Submit transaction error:", error);
      throw error;
    }
  }

  // Complete transfer flow
  async transferAda(recipientAddress, amountAda) {
    try {
      console.log("=== Starting Transfer ===");

      // Step 1: Build transaction on backend
      console.log("Step 1: Building transaction...");
      const builtTx = await this.buildTransaction(recipientAddress, amountAda);

      // Step 2: Sign transaction with Lace wallet
      console.log("Step 2: Signing transaction with Lace wallet...");
      const witnessSetHex = await this.signTransaction(builtTx.txHex);

      // Step 3: Submit signed transaction (pass both witness set and original tx)
      console.log("Step 3: Submitting transaction...");
      const result = await this.submitTransaction(witnessSetHex, builtTx.txHex);

      console.log("=== Transfer Complete ===");

      return {
        success: true,
        txHash: result.txHash,
        fee: builtTx.fee,
      };
    } catch (error) {
      console.error("Transfer error:", error);
      throw error;
    }
  }

  // Get transaction status
  async getTransactionStatus(txHash) {
    try {
      console.log("Fetching transaction status for:", txHash);

      const response = await fetch(`${API_BASE_URL}/transaction/${txHash}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      return data.data;
    } catch (error) {
      console.error("Get transaction status error:", error);
      throw error;
    }
  }
}

// Example usage (for testing in console)
async function exampleUsage() {
  const client = new CardanoClient();

  try {
    // 1. Connect wallet
    console.log("Connecting to Lace wallet...");
    const connection = await client.connectWallet();
    console.log("Connected:", connection.address);

    // 2. Get balance
    console.log("Getting balance...");
    const balance = await client.getBalance();
    console.log("Balance:", balance.balance.ada, "ADA");

    // 3. Transfer ADA
    const recipientAddress = "addr_test1..."; // Replace with actual address
    const amount = "10"; // 10 tADA

    console.log("Transferring", amount, "tADA to", recipientAddress);
    const result = await client.transferAda(recipientAddress, amount);

    console.log("Transfer successful!");
    console.log("Transaction Hash:", result.txHash);
    console.log("Fee:", result.fee, "lovelace");

    // 4. Check transaction status after 30 seconds
    setTimeout(async () => {
      const status = await client.getTransactionStatus(result.txHash);
      console.log("Transaction status:", status);
    }, 30000);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Export for use in other files
if (typeof module !== "undefined" && module.exports) {
  module.exports = CardanoClient;
}
