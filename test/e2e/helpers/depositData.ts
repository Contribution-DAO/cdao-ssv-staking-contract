import { ethers } from "hardhat"

/**
 * SSZ Merkleization for DepositData.
 *
 * The beacon deposit contract validates:
 *   deposit_data_root == sha256(SSZ(pubkey, withdrawal_credentials, amount, signature))
 *
 * BLS signature validity is NOT checked on-chain (consensus layer only).
 * So we can use random pubkeys + random signatures, as long as the root is correct.
 *
 * From the reference Solidity deposit contract:
 *   pubkey_root = sha256(pubkey || zeros(16))
 *   signature_root = sha256(sha256(sig[0:64]) || sha256(sig[64:96] || zeros(32)))
 *   node = sha256(pubkey_root || withdrawal_credentials)
 *   node = sha256(node || sha256(amount_le_8bytes || zeros(24) || signature_root))
 */

function pad(data: Uint8Array, length: number): Uint8Array {
  const padded = new Uint8Array(length)
  padded.set(data)
  return padded
}

function toLittleEndian64(value: bigint): Uint8Array {
  const buf = new Uint8Array(32)
  let v = value
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return buf
}

export function computeDepositDataRoot(
  pubkey: Uint8Array,
  withdrawalCreds: Uint8Array,
  amountGwei: bigint,
  signature: Uint8Array
): string {
  // 1. pubkey_root = sha256(pubkey || zeros(16))
  const pubkeyRoot = ethers.sha256(pad(pubkey, 64))

  // 2. signature_root = sha256(sha256(sig[0:64]) || sha256(sig[64:96] || zeros(32)))
  const sigPart1 = ethers.sha256(signature.slice(0, 64))
  const sigPart2 = ethers.sha256(pad(signature.slice(64, 96), 64))
  const signatureRoot = ethers.sha256(ethers.concat([sigPart1, sigPart2]))

  // 3. left = sha256(pubkey_root || withdrawal_credentials)
  //    withdrawal_credentials is raw 32 bytes (NOT hashed)
  const left = ethers.sha256(ethers.concat([pubkeyRoot, withdrawalCreds]))

  // 4. right = sha256(amount_le_padded_32 || signature_root)
  //    amount is raw LE uint64 padded to 32 bytes (NOT hashed)
  const amountBytes = toLittleEndian64(amountGwei)
  const right = ethers.sha256(ethers.concat([amountBytes, signatureRoot]))

  // 5. root = sha256(left || right)
  return ethers.sha256(ethers.concat([left, right]))
}

export function buildWithdrawalCredentials(address: string): Uint8Array {
  // 0x01 prefix + 11 zero bytes + 20-byte address
  const creds = new Uint8Array(32)
  creds[0] = 0x01
  const addrBytes = ethers.getBytes(address)
  creds.set(addrBytes, 12)
  return creds
}

export function generateTestDepositData(withdrawalAddress: string) {
  const pubkey = ethers.randomBytes(48)
  const signature = ethers.randomBytes(96)
  const withdrawalCreds = buildWithdrawalCredentials(withdrawalAddress)
  const amountGwei = 32000000000n // 32 ETH in Gwei

  const depositDataRoot = computeDepositDataRoot(
    pubkey,
    withdrawalCreds,
    amountGwei,
    signature
  )

  return {
    pubkey: ethers.hexlify(pubkey),
    signature: ethers.hexlify(signature),
    depositDataRoot,
    withdrawalCreds: ethers.hexlify(withdrawalCreds),
  }
}
