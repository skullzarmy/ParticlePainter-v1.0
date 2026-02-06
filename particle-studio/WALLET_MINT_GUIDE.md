# Wallet Connect and HEN (Hic Et Nunc) Mint Integration

This document explains how to use the wallet connect and HEN minting features in Particle Painter.

## Features

### Wallet Connection

The app supports connecting Tezos wallets using the latest Beacon SDK v4.7.0 and Taquito v24.0.2, allowing users to:
- Connect Temple Wallet, Kukai, or other Tezos wallets
- Secure wallet session management with connection stabilization
- View wallet address and XTZ balance
- Disconnect wallet when done

### Mint to HEN (Hic Et Nunc)

Once connected, users can mint their particle art as NFTs directly to the Tezos blockchain through the HEN V1 minter contract:
- Mints to the HEN V1 minter contract: `KT1Hkg5qeNhfwpKW4fXvq7HGZB9z2EnmCCA9`
- Select export format (GIF or WebM)
- Choose number of editions (1-10,000)
- Add a description for the artwork
- Automatic IPFS upload via Pinata
- On-chain minting with transaction confirmation

## How to Use

### 1. Enable the Frame Buffer

Before minting, ensure the rolling buffer is enabled:
1. Click the "⚡ Quick" button in the export bar
2. Check "Enable Rolling Buffer"
3. Select desired buffer duration and quality
4. Wait for frames to accumulate

### 2. Connect Your Wallet

1. Click the "🔗 Connect Wallet" button in the export bar
2. Select your Tezos wallet from the Beacon modal
3. Approve the connection request in your wallet
4. Sign the authentication message to prove ownership
5. Your address and balance will be displayed

### 3. Mint Your Art

1. Click the "🎨 TEIA" button (only active when wallet is connected)
2. In the mint modal:
   - Choose file type (GIF or WebM)
   - Set number of editions
   - Enter a description for your artwork
3. Click "Mint NFT"
4. The app will:
   - Export your particle art from the buffer
   - Upload the artwork to IPFS via Pinata
   - Create and upload metadata to IPFS
   - Send the mint transaction to the HEN contract
   - Wait for blockchain confirmation
   - Display the transaction hash and TzKT explorer link

### 4. Disconnect (Optional)

When finished, click "Disconnect" in the wallet connect section to disconnect your wallet.

## IPFS Configuration (For Developers)

The current implementation requires IPFS configuration for production use:

1. Choose an IPFS pinning service:
   - [NFT.Storage](https://nft.storage) (free tier available)
   - [Pinata](https://pinata.cloud) (free tier available)
   - [Web3.Storage](https://web3.storage) (free tier available)

2. Obtain API keys from your chosen service

3. Update `src/services/teiaService.ts`:
   - Replace the `uploadToIPFS` method with your service's API integration
   - Add proper authentication headers
   - Handle the response format from your chosen service

Example for NFT.Storage:
```typescript
import { NFTStorage } from 'nft.storage'

const client = new NFTStorage({ token: 'YOUR_API_KEY' })
const cid = await client.storeBlob(file)
const ipfsUri = `ipfs://${cid}`
```

## Technical Details

### Dependencies
- `@taquito/taquito`: v24.0.2 - Tezos blockchain interaction (latest)
- `@taquito/beacon-wallet`: v24.0.2 - Wallet connection via Beacon SDK (latest)
- `@airgap/beacon-sdk`: v4.7.0 - Beacon protocol implementation (latest)
- `vite-plugin-node-polyfills`: Browser compatibility for crypto libraries

### Architecture
- Wallet services are lazy-loaded to prevent initialization errors
- State management uses Zustand store
- Frame buffer system captures frames for quick export
- Modular service architecture for easy customization

### Security Best Practices
The implementation follows security best practices:
- **Connection Stabilization**: 500ms delay after wallet connection to ensure Beacon SDK transport layer is fully initialized
- **Event-Based Account Management**: Uses ACTIVE_ACCOUNT_SET event subscription for proper account handling
- **Session Management**: Tracks connection readiness to prevent race conditions during signing operations
- **Timeout Handling**: 60-second timeout for wallet connection with proper cleanup
- **Error Handling**: Comprehensive error messages for user actions (rejected transactions, insufficient balance, etc.)
- **IPFS Security**: Files uploaded to Pinata with JWT authentication
- **Transaction Validation**: Hard guards ensure operation hash is returned before considering mint successful
- **Network Validation**: Explicit mainnet configuration prevents accidental testnet operations

### HEN Contract Integration
The minting function interacts with the HEN V1 minter contract:
- **Contract Address**: `KT1Hkg5qeNhfwpKW4fXvq7HGZB9z2EnmCCA9` (HEN V1 Minter)
- **Entrypoint**: `mint_OBJKT(address, nat, bytes, nat)`
- **Parameters**:
  - `address`: Creator's Tezos address
  - `nat`: Number of editions to mint
  - `bytes`: Hex-encoded IPFS metadata URI
  - `nat`: Royalties in basis points (default: 1000 = 10%)
- **Storage Limit**: 310 (optimized for HEN contract)
- **Confirmation**: Polls TzKT API for transaction status (up to 5 minutes)
- **Note**: The minter contract calls the OBJKT token contract (`KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton`) internally

## Troubleshooting

### Wallet Connection Issues
- Ensure you have a Tezos wallet installed (Temple, Kukai, etc.)
- Check that you're on the mainnet network
- Try disconnecting and reconnecting
- Clear browser cache if persistent issues occur

### Export Issues
- Ensure the frame buffer is enabled and has frames
- Check that buffer quality and duration are set appropriately
- For WebM with audio, ensure an audio file is loaded

### IPFS Upload Errors
- Current implementation requires IPFS service configuration
- Follow the "IPFS Configuration" section above
- Contact repository maintainers if you need help with setup

## Support

For issues or questions:
1. Check the [GitHub Issues](https://github.com/Paulwhoisaghostnet/ParticlePainter-v1.0/issues)
2. Review the code in `src/services/` for implementation details
3. Open a new issue if you encounter bugs
