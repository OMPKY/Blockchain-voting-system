require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*"
    },
    sepolia: {
      provider: () => new HDWalletProvider({
        privateKeys: [process.env.ADMIN_PRIVATE_KEY, process.env.USER_PRIVATE_KEY],
        providerOrUrl: process.env.INFURA_URL,
        pollingInterval: 15000 // 🔹 FIX: Slows down block polling so Infura doesn't crash
      }),
      network_id: 11155111,
      gas: 4465030,
      confirmations: 1,       
      timeoutBlocks: 500,
      networkCheckTimeout: 1000000, 
      skipDryRun: true
    }
  },
  compilers: {
    solc: {
      version: "0.5.15"
    }
  }
};