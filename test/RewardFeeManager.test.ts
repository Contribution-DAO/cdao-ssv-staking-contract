import { expect } from "chai"
import { ethers } from "hardhat"
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { RewardFeeManager, FeeManagerFactory } from "../typechain-types"
import { deployContractsFixture } from "./fixtures/deployContracts"

describe("RewardFeeManager", () => {
  let rewardFeeManager: RewardFeeManager
  let feeManagerFactory: FeeManagerFactory
  let owner: any
  let service: any
  let client: any
  let referrer: any
  let operator: any
  let otherAccount: any

  beforeEach(async () => {
    const fixture = await loadFixture(deployContractsFixture)
    rewardFeeManager = fixture.rewardFeeManager
    feeManagerFactory = fixture.feeManagerFactory
    owner = fixture.owner
    service = fixture.service
    client = fixture.client
    referrer = fixture.referrer
    operator = fixture.operator
    otherAccount = fixture.otherAccount
  })

  describe("Initialization", () => {
    it("should set the correct service address", async () => {
      const serviceAddress = await rewardFeeManager.service()
      expect(serviceAddress).to.equal(service.address)
    })
  })

  describe("Client Configuration", () => {
    it("should allow initializing client config", async () => {
      const clientBasisPoints = 9000n // 90%
      const tx = await feeManagerFactory.connect(owner).createFeeManager(
        await rewardFeeManager.getAddress(),
        {
          recipient: client.address,
          basisPoints: clientBasisPoints,
        },
        {
          recipient: ethers.ZeroAddress,
          basisPoints: 0n,
        }
      )
      const receipt = await tx.wait()
      const event: any = receipt?.logs[0]
      const feeManagerAddress = event?.address

      const feeManager = await ethers.getContractAt(
        "RewardFeeManager",
        feeManagerAddress
      )

      expect(await feeManager.client()).to.equal(client.address)
      expect(await feeManager.clientBasisPoints()).to.equal(clientBasisPoints)
    })

    it("should revert when initializing with invalid basis points", async () => {
      const invalidBasisPoints = 10001n // More than 100%
      await expect(
        feeManagerFactory.connect(owner).createFeeManager(
          await rewardFeeManager.getAddress(),
          {
            recipient: client.address,
            basisPoints: invalidBasisPoints,
          },
          {
            recipient: ethers.ZeroAddress,
            basisPoints: 0n,
          }
        )
      ).to.be.revertedWithCustomError(
        rewardFeeManager,
        "InvalidClientBasisPoints"
      )
    })
  })

  describe("Withdraw functionality", () => {
    const depositAmount = ethers.parseEther("10")
    const clientBasisPoints = 9000n // 90%
    const referrerBasisPoints = 500n // 5%
    let feeManager: RewardFeeManager

    beforeEach(async () => {
      // Setup client and referrer
      const tx = await feeManagerFactory.connect(owner).createFeeManager(
        await rewardFeeManager.getAddress(),
        {
          recipient: client.address,
          basisPoints: clientBasisPoints,
        },
        {
          recipient: referrer.address,
          basisPoints: referrerBasisPoints,
        }
      )
      const receipt = await tx.wait()
      const event: any = receipt?.logs[0]
      const feeManagerAddress = event?.address

      feeManager = await ethers.getContractAt(
        "RewardFeeManager",
        feeManagerAddress
      )

      // Send ETH to the contract
      await owner.sendTransaction({
        to: await feeManager.getAddress(),
        value: depositAmount,
      })
    })

    it("should allow operator to withdraw and split funds correctly", async () => {
      const initialServiceBalance = await ethers.provider.getBalance(
        service.address
      )
      const initialClientBalance = await ethers.provider.getBalance(
        client.address
      )
      const initialReferrerBalance = await ethers.provider.getBalance(
        referrer.address
      )

      await feeManager.connect(operator).withdraw()

      const clientAmount = (depositAmount * clientBasisPoints) / 10000n
      const referrerAmount = (depositAmount * referrerBasisPoints) / 10000n
      const serviceAmount = depositAmount - clientAmount - referrerAmount

      expect(await ethers.provider.getBalance(client.address)).to.equal(
        initialClientBalance + clientAmount
      )
      expect(await ethers.provider.getBalance(referrer.address)).to.equal(
        initialReferrerBalance + referrerAmount
      )
      expect(await ethers.provider.getBalance(service.address)).to.equal(
        initialServiceBalance + serviceAmount
      )
    })

    it("should allow client to withdraw", async () => {
      await feeManager.connect(client).withdraw()
      expect(
        await ethers.provider.getBalance(await feeManager.getAddress())
      ).to.equal(0n)
    })

    it("should allow operator to withdraw", async () => {
      await feeManager.connect(operator).withdraw()
      expect(
        await ethers.provider.getBalance(await feeManager.getAddress())
      ).to.equal(0n)
    })

    it("should revert when non-authorized user tries to withdraw", async () => {
      await expect(
        feeManager.connect(otherAccount).withdraw()
      ).to.be.revertedWithCustomError(feeManager, "CallerNotClient")
    })

    it("should revert when there's nothing to withdraw", async () => {
      await feeManager.connect(operator).withdraw()
      await expect(
        feeManager.connect(operator).withdraw()
      ).to.be.revertedWithCustomError(feeManager, "NothingToWithdraw")
    })
  })
})
