// Install dependencies:
// npm install express @blockfrost/blockfrost-js @emurgo/cardano-serialization-lib-nodejs cors dotenv

const express = require("express");
const cors = require("cors");
const { BlockFrostAPI } = require("@blockfrost/blockfrost-js");
const CardanoWasm = require("@emurgo/cardano-serialization-lib-nodejs");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Initialize Blockfrost API
const blockfrost = new BlockFrostAPI({
  projectId: process.env.BLOCKFROST_PROJECT_ID, // preprod testnet token
});

// Network parameters (Preprod testnet)
const NETWORK = {
  id: 0, // 0 = testnet, 1 = mainnet
  protocolParams: null,
};

// Helper function to convert lovelace to ADA
const lovelaceToAda = (lovelace) => {
  return (parseInt(lovelace) / 1000000).toFixed(6);
};

// Helper function to convert ADA to lovelace
const adaToLovelace = (ada) => {
  return (parseFloat(ada) * 1000000).toString();
};

// Helper function to convert hex address to Bech32
function ensureBech32Address(address) {
  // If it's already Bech32, return it
  if (address.startsWith("addr_test1") || address.startsWith("addr1")) {
    console.log("Address is already Bech32");
    return address;
  }

  // If it's hex, convert it
  try {
    console.log("Converting hex address to Bech32...");
    const addressBytes = Buffer.from(address, "hex");
    const addr = CardanoWasm.Address.from_bytes(addressBytes);
    const bech32 = addr.to_bech32();
    console.log("Converted to:", bech32);
    return bech32;
  } catch (error) {
    console.error("Address conversion failed:", error);
    throw new Error("Invalid address format");
  }
}

// Initialize protocol parameters on startup
async function initProtocolParams() {
  try {
    console.log("Loading protocol parameters...");
    const latest = await blockfrost.epochsLatest();
    const params = await blockfrost.epochsParameters(latest.epoch);
    NETWORK.protocolParams = params;
    console.log("✅ Protocol parameters loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load protocol parameters:", error.message);
    console.error("Please check your BLOCKFROST_PROJECT_ID in .env file");
  }
}

// Convert hex address to Bech32
app.post("/api/convert-address", async (req, res) => {
  try {
    const { hexAddress } = req.body;

    if (!hexAddress) {
      return res.status(400).json({
        success: false,
        error: "Missing hexAddress",
      });
    }

    console.log("Converting hex address:", hexAddress.substring(0, 20) + "...");

    const bech32Address = ensureBech32Address(hexAddress);

    console.log(
      "✅ Converted to Bech32:",
      bech32Address.substring(0, 20) + "..."
    );

    res.json({
      success: true,
      bech32Address: bech32Address,
      hexAddress: hexAddress,
    });
  } catch (error) {
    console.error("Convert address error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get address information
app.get("/api/address/:address", async (req, res) => {
  try {
    const { address } = req.params;

    console.log("=== Address Request ===");
    console.log("Address received:", address.substring(0, 20) + "...");
    console.log("Address length:", address.length);

    // Convert to Bech32 if needed
    const bech32Address = ensureBech32Address(address);
    console.log(
      "Using Bech32 address:",
      bech32Address.substring(0, 20) + "..."
    );

    // Validate address format for testnet
    if (!bech32Address.startsWith("addr_test1")) {
      console.error("❌ Invalid address - must be Preprod testnet address");
      return res.status(400).json({
        success: false,
        error:
          "Invalid address format. Must be a Preprod testnet address starting with addr_test1",
      });
    }

    console.log("Fetching address info from Blockfrost...");
    // Get address info
    const addressInfo = await blockfrost.addresses(bech32Address);
    console.log("✅ Address info received");

    console.log("Fetching UTXOs from Blockfrost...");
    // Get UTXOs
    const utxos = await blockfrost.addressesUtxos(bech32Address);
    console.log("✅ Found", utxos.length, "UTXOs");

    res.json({
      success: true,
      data: {
        address: addressInfo.address,
        balance: {
          lovelace: addressInfo.amount[0].quantity,
          ada: lovelaceToAda(addressInfo.amount[0].quantity),
        },
        utxos: utxos.length,
        utxoList: utxos.map((utxo) => ({
          txHash: utxo.tx_hash,
          outputIndex: utxo.output_index,
          amount: utxo.amount,
        })),
      },
    });
  } catch (error) {
    console.error("=== ERROR in /api/address/:address ===");
    console.error("Error message:", error.message);
    console.error("Error response:", error.response?.data);

    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || "No additional details",
    });
  }
});

// Get transaction details
app.get("/api/transaction/:txHash", async (req, res) => {
  try {
    const { txHash } = req.params;
    console.log("Fetching transaction:", txHash);
    const tx = await blockfrost.txs(txHash);

    res.json({
      success: true,
      data: tx,
    });
  } catch (error) {
    console.error("Transaction fetch error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Build transaction
app.post("/api/build-transaction", async (req, res) => {
  try {
    let { senderAddress, recipientAddress, amountAda } = req.body;

    console.log("=== Build Transaction Request ===");
    console.log("Sender (raw):", senderAddress?.substring(0, 20) + "...");
    console.log("Recipient (raw):", recipientAddress?.substring(0, 20) + "...");
    console.log("Amount:", amountAda, "ADA");

    if (!senderAddress || !recipientAddress || !amountAda) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: senderAddress, recipientAddress, amountAda",
      });
    }

    // Convert addresses to Bech32 if needed
    senderAddress = ensureBech32Address(senderAddress);
    recipientAddress = ensureBech32Address(recipientAddress);

    console.log("Sender (Bech32):", senderAddress.substring(0, 20) + "...");
    console.log(
      "Recipient (Bech32):",
      recipientAddress.substring(0, 20) + "..."
    );

    // Get UTXOs for sender
    console.log("Fetching UTXOs...");
    const utxos = await blockfrost.addressesUtxos(senderAddress);
    console.log("✅ Found", utxos.length, "UTXOs");

    if (utxos.length === 0) {
      return res.status(400).json({
        success: false,
        error:
          "No UTXOs available for this address. Make sure you have tADA in your wallet.",
      });
    }

    // Get protocol parameters
    const protocolParams = NETWORK.protocolParams;

    if (!protocolParams) {
      return res.status(500).json({
        success: false,
        error:
          "Protocol parameters not loaded. Server may still be initializing.",
      });
    }

    // Convert amount to lovelace
    const amountLovelace = adaToLovelace(amountAda);
    console.log("Amount in lovelace:", amountLovelace);

    // Build transaction using cardano-serialization-lib
    console.log("Building transaction...");
    const txBuilder = CardanoWasm.TransactionBuilder.new(
      CardanoWasm.TransactionBuilderConfigBuilder.new()
        .fee_algo(
          CardanoWasm.LinearFee.new(
            CardanoWasm.BigNum.from_str(protocolParams.min_fee_a.toString()),
            CardanoWasm.BigNum.from_str(protocolParams.min_fee_b.toString())
          )
        )
        .pool_deposit(CardanoWasm.BigNum.from_str(protocolParams.pool_deposit))
        .key_deposit(CardanoWasm.BigNum.from_str(protocolParams.key_deposit))
        .max_value_size(parseInt(protocolParams.max_val_size))
        .max_tx_size(parseInt(protocolParams.max_tx_size))
        .coins_per_utxo_byte(
          CardanoWasm.BigNum.from_str(protocolParams.coins_per_utxo_size)
        )
        .build()
    );

    // Add output (recipient)
    const outputAddress = CardanoWasm.Address.from_bech32(recipientAddress);
    const outputValue = CardanoWasm.Value.new(
      CardanoWasm.BigNum.from_str(amountLovelace)
    );

    txBuilder.add_output(
      CardanoWasm.TransactionOutput.new(outputAddress, outputValue)
    );

    // Add inputs (UTXOs)
    const transactionUnspentOutputs =
      CardanoWasm.TransactionUnspentOutputs.new();

    for (const utxo of utxos) {
      const txHash = CardanoWasm.TransactionHash.from_bytes(
        Buffer.from(utxo.tx_hash, "hex")
      );
      const txIndex = utxo.output_index;

      const inputValue = CardanoWasm.Value.new(
        CardanoWasm.BigNum.from_str(utxo.amount[0].quantity)
      );

      const input = CardanoWasm.TransactionInput.new(txHash, txIndex);

      const output = CardanoWasm.TransactionOutput.new(
        CardanoWasm.Address.from_bech32(senderAddress),
        inputValue
      );

      transactionUnspentOutputs.add(
        CardanoWasm.TransactionUnspentOutput.new(input, output)
      );
    }

    // Add inputs to transaction
    txBuilder.add_inputs_from(
      transactionUnspentOutputs,
      CardanoWasm.Address.from_bech32(senderAddress)
    );

    // Set TTL (time to live) - current slot + 2 hours
    const latestBlock = await blockfrost.blocksLatest();
    const ttl = latestBlock.slot + 7200;
    txBuilder.set_ttl(ttl);

    // Add change address
    txBuilder.add_change_if_needed(
      CardanoWasm.Address.from_bech32(senderAddress)
    );

    // Build transaction
    const txBody = txBuilder.build();

    // Create witness set
    const witnessSet = CardanoWasm.TransactionWitnessSet.new();

    // Create transaction
    const transaction = CardanoWasm.Transaction.new(
      txBody,
      witnessSet,
      undefined // metadata
    );

    console.log("✅ Transaction built successfully");
    console.log("Fee:", txBody.fee().to_str(), "lovelace");

    // Return transaction for signing (we'll calculate hash after submission)
    res.json({
      success: true,
      data: {
        txHex: Buffer.from(transaction.to_bytes()).toString("hex"),
        txHash: "will_be_calculated_after_signing", // Placeholder
        fee: txBody.fee().to_str(),
        ttl: ttl,
      },
    });
  } catch (error) {
    console.error("=== Build transaction error ===");
    console.error("Error message:", error.message);
    console.error("Full error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

// Submit signed transaction
app.post("/api/submit-transaction", async (req, res) => {
  try {
    console.log("=== Submit Transaction Request ===");
    console.log("Request body keys:", Object.keys(req.body));
    console.log("Request body:", JSON.stringify(req.body).substring(0, 200));

    const { signedTxHex, txHex } = req.body;

    console.log("signedTxHex exists:", !!signedTxHex);
    console.log("signedTxHex type:", typeof signedTxHex);
    console.log("signedTxHex length:", signedTxHex ? signedTxHex.length : 0);
    console.log("txHex exists:", !!txHex);
    console.log("txHex type:", typeof txHex);
    console.log("txHex length:", txHex ? txHex.length : 0);

    if (!signedTxHex || !txHex) {
      console.error("❌ Missing required fields");
      return res.status(400).json({
        success: false,
        error: "Missing signedTxHex or txHex",
        received: {
          signedTxHex: !!signedTxHex,
          txHex: !!txHex,
        },
      });
    }

    console.log("=== Submitting Transaction ===");
    console.log("Original tx hex length:", txHex.length);
    console.log("Witness set hex length:", signedTxHex.length);

    try {
      // Deserialize the original transaction
      const tx = CardanoWasm.Transaction.from_bytes(Buffer.from(txHex, "hex"));

      // Deserialize the witness set from Lace
      const witnessSet = CardanoWasm.TransactionWitnessSet.from_bytes(
        Buffer.from(signedTxHex, "hex")
      );

      // Create the final signed transaction
      const signedTx = CardanoWasm.Transaction.new(
        tx.body(),
        witnessSet,
        tx.auxiliary_data() // metadata if any
      );

      const signedTxBytes = signedTx.to_bytes();
      console.log("Final signed tx length:", signedTxBytes.length);

      // Submit to Blockfrost
      const txHash = await blockfrost.txSubmit(signedTxBytes);

      console.log("✅ Transaction submitted successfully");
      console.log("TxHash:", txHash);

      res.json({
        success: true,
        data: {
          txHash: txHash,
        },
      });
    } catch (innerError) {
      console.error("Transaction assembly error:", innerError);
      throw new Error(
        "Failed to assemble signed transaction: " + innerError.message
      );
    }
  } catch (error) {
    console.error("=== Submit transaction error ===");
    console.error("Error message:", error.message);
    console.error("Error response:", error.response?.data);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data,
    });
  }
});

// Get network info
app.get("/api/network-info", async (req, res) => {
  try {
    const latest = await blockfrost.blocksLatest();
    const health = await blockfrost.health();

    res.json({
      success: true,
      data: {
        network: "preprod",
        latestBlock: {
          height: latest.height,
          slot: latest.slot,
          hash: latest.hash,
        },
        blockfrostHealth: health,
      },
    });
  } catch (error) {
    console.error("Network info error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    protocolParamsLoaded: NETWORK.protocolParams !== null,
  });
});

// Initialize and start server
const PORT = process.env.PORT || 3000;

initProtocolParams().then(() => {
  app.listen(PORT, () => {
    console.log("\n" + "=".repeat(50));
    console.log("🚀 Cardano Backend Server running on port", PORT);
    console.log("📡 Network: Preprod Testnet");
    console.log("🔗 Blockfrost: Connected");
    console.log("=".repeat(50) + "\n");
  });
});

module.exports = app;
