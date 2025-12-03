const Cardano = require("@emurgo/cardano-serialization-lib-nodejs");

function generateSenderWallet() {
  // Generate private key (edd25519)
  const privateKey = Cardano.PrivateKey.generate_ed25519();

  // Public key
  const publicKey = privateKey.to_public();

  // Payment credential
  const paymentKeyHash = publicKey.hash();
  const paymentCred = Cardano.Credential.from_keyhash(paymentKeyHash);

  // Network ID:
  // 1 = mainnet
  // 0 = testnets (preview/preprod)
  const TESTNET = 0;

  // Create ENTERPRISE address (payment-only, no staking)
  const enterpriseAddr = Cardano.EnterpriseAddress.new(TESTNET, paymentCred);

  const address = enterpriseAddr.to_address().to_bech32();

  return {
    address,
    privateKeyHex: Buffer.from(privateKey.as_bytes()).toString("hex"),
  };
}

const wallet = generateSenderWallet();
console.log("Generated Sender Address:", wallet.address);
console.log("Private Key:", wallet.privateKeyHex);

module.exports = { generateSenderWallet };
