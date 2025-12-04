const fs = require("fs");
const Cardano = require("@emurgo/cardano-serialization-lib-nodejs");

const FILE_PATH = "./senderWallet.json";

function generateSenderWallet() {
  // If wallet already exists, read and return it
  if (fs.existsSync(FILE_PATH)) {
    const savedWallet = JSON.parse(fs.readFileSync(FILE_PATH));
    return savedWallet;
  }

  // Generate private key (ed25519)
  const privateKey = Cardano.PrivateKey.generate_ed25519();

  // Public key
  const publicKey = privateKey.to_public();

  // Payment credential
  const paymentKeyHash = publicKey.hash();
  const paymentCred = Cardano.Credential.from_keyhash(paymentKeyHash);

  // Network ID: 1 = mainnet, 0 = testnets (preview/preprod)
  const TESTNET = 0;

  // Create ENTERPRISE address (payment-only, no staking)
  const enterpriseAddr = Cardano.EnterpriseAddress.new(TESTNET, paymentCred);
  const address = enterpriseAddr.to_address().to_bech32();

  // Save to file
  const walletData = {
    address,
    privateKeyHex: Buffer.from(privateKey.as_bytes()).toString("hex"),
  };
  fs.writeFileSync(FILE_PATH, JSON.stringify(walletData, null, 2));

  return walletData;
}

// Generate (or load) wallet
const wallet = generateSenderWallet();
console.log("Generated Sender Address:", wallet.address);
console.log("Private Key:", wallet.privateKeyHex);

module.exports = { generateSenderWallet };
