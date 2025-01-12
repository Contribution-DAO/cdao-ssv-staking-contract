import { ethers } from "ethers"

export function addressToWithdrawalCredentials(address: string): string {
  // Ensure address is valid and convert to lowercase
  const normalizedAddress = ethers.getAddress(address).toLowerCase()

  // Remove 0x prefix and pad with zeros to 62 chars (31 bytes)
  const paddedAddress = normalizedAddress.slice(2).padStart(62, "0")

  // Add 0x01 prefix for withdrawal credentials format
  return "0x01" + paddedAddress
}

export function getEvent(receipt: any, eventName: string) {
  // Debug log the entire receipt
  console.log("Receipt:", JSON.stringify(receipt, null, 2))
  console.log("\nFirst log:", JSON.stringify(receipt.logs[0], null, 2))

  // Get the first event that matches the name
  const event = receipt.logs[0] // First event is what we want
  if (!event) {
    throw new Error(`No events found in transaction receipt`)
  }
  return event
}
