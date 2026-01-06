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

  describe("withdrawAmount functionality", () => {
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

    it("should allow operator to withdrawAmount and split funds correctly", async () => {
      const withdrawAmount = ethers.parseEther("5")

      const initialServiceBalance = await ethers.provider.getBalance(
        service.address
      )
      const initialClientBalance = await ethers.provider.getBalance(
        client.address
      )
      const initialReferrerBalance = await ethers.provider.getBalance(
        referrer.address
      )

      await feeManager.connect(operator).withdrawAmount(withdrawAmount)

      const clientAmount = (withdrawAmount * clientBasisPoints) / 10000n
      const referrerAmount = (withdrawAmount * referrerBasisPoints) / 10000n
      const serviceAmount = withdrawAmount - clientAmount - referrerAmount

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

    it("should allow client to withdrawAmount", async () => {
      const withdrawAmount = ethers.parseEther("5")
      const initialContractBalance = await ethers.provider.getBalance(
        await feeManager.getAddress()
      )

      await feeManager.connect(client).withdrawAmount(withdrawAmount)

      expect(
        await ethers.provider.getBalance(await feeManager.getAddress())
      ).to.equal(initialContractBalance - withdrawAmount)
    })

    it("should allow operator to withdrawAmount", async () => {
      const withdrawAmount = ethers.parseEther("5")
      const initialContractBalance = await ethers.provider.getBalance(
        await feeManager.getAddress()
      )

      await feeManager.connect(operator).withdrawAmount(withdrawAmount)

      expect(
        await ethers.provider.getBalance(await feeManager.getAddress())
      ).to.equal(initialContractBalance - withdrawAmount)
    })

    it("should leave remaining balance after partial withdrawal", async () => {
      const withdrawAmount = ethers.parseEther("3")
      const expectedRemaining = depositAmount - withdrawAmount

      await feeManager.connect(operator).withdrawAmount(withdrawAmount)

      expect(
        await ethers.provider.getBalance(await feeManager.getAddress())
      ).to.equal(expectedRemaining)
    })

    it("should allow withdrawing the full balance", async () => {
      await feeManager.connect(operator).withdrawAmount(depositAmount)

      expect(
        await ethers.provider.getBalance(await feeManager.getAddress())
      ).to.equal(0n)
    })

    it("should revert when non-authorized user tries to withdrawAmount", async () => {
      const withdrawAmount = ethers.parseEther("5")
      await expect(
        feeManager.connect(otherAccount).withdrawAmount(withdrawAmount)
      ).to.be.revertedWithCustomError(feeManager, "CallerNotClient")
    })

    it("should revert when amount is zero", async () => {
      await expect(
        feeManager.connect(operator).withdrawAmount(0n)
      ).to.be.revertedWithCustomError(feeManager, "NothingToWithdraw")
    })

    it("should revert when amount exceeds balance", async () => {
      const excessiveAmount = ethers.parseEther("20") // More than depositAmount
      await expect(
        feeManager.connect(operator).withdrawAmount(excessiveAmount)
      ).to.be.revertedWithCustomError(feeManager, "InsufficientBalance")
    })

    it("should emit Withdrawn event with correct amounts", async () => {
      const withdrawAmount = ethers.parseEther("5")

      const clientAmount = (withdrawAmount * clientBasisPoints) / 10000n
      const referrerAmount = (withdrawAmount * referrerBasisPoints) / 10000n
      const serviceAmount = withdrawAmount - clientAmount - referrerAmount

      await expect(feeManager.connect(operator).withdrawAmount(withdrawAmount))
        .to.emit(feeManager, "Withdrawn")
        .withArgs(serviceAmount, clientAmount, referrerAmount)
    })

    it("should allow multiple consecutive partial withdrawals", async () => {
      const firstWithdraw = ethers.parseEther("3")
      const secondWithdraw = ethers.parseEther("4")

      await feeManager.connect(operator).withdrawAmount(firstWithdraw)
      expect(
        await ethers.provider.getBalance(await feeManager.getAddress())
      ).to.equal(depositAmount - firstWithdraw)

      await feeManager.connect(operator).withdrawAmount(secondWithdraw)
      expect(
        await ethers.provider.getBalance(await feeManager.getAddress())
      ).to.equal(depositAmount - firstWithdraw - secondWithdraw)
    })

    it("should revert when owner tries to withdrawAmount (only operator/client allowed)", async () => {
      const withdrawAmount = ethers.parseEther("5")
      await expect(
        feeManager.connect(owner).withdrawAmount(withdrawAmount)
      ).to.be.revertedWithCustomError(feeManager, "CallerNotClient")
    })

    it("should handle very small amounts (1 wei) correctly", async () => {
      const smallAmount = 1n // 1 wei

      const initialServiceBalance = await ethers.provider.getBalance(
        service.address
      )
      const initialClientBalance = await ethers.provider.getBalance(
        client.address
      )
      const initialReferrerBalance = await ethers.provider.getBalance(
        referrer.address
      )

      await feeManager.connect(operator).withdrawAmount(smallAmount)

      // With 1 wei: client 90% = 0, referrer 5% = 0, service gets all 1 wei
      const clientAmount = (smallAmount * clientBasisPoints) / 10000n // 0
      const referrerAmount = (smallAmount * referrerBasisPoints) / 10000n // 0
      const serviceAmount = smallAmount - clientAmount - referrerAmount // 1

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

    it("should work correctly when using withdrawAmount then withdraw for remaining", async () => {
      const partialAmount = ethers.parseEther("4")

      // First do partial withdrawal with withdrawAmount
      await feeManager.connect(operator).withdrawAmount(partialAmount)

      const remainingBalance = await ethers.provider.getBalance(
        await feeManager.getAddress()
      )
      expect(remainingBalance).to.equal(depositAmount - partialAmount)

      // Then withdraw the rest with regular withdraw()
      await feeManager.connect(operator).withdraw()

      expect(
        await ethers.provider.getBalance(await feeManager.getAddress())
      ).to.equal(0n)
    })

    it("should revert on second call after full withdrawAmount (nothing left)", async () => {
      // First withdraw everything
      await feeManager.connect(operator).withdrawAmount(depositAmount)

      // Second call should revert
      await expect(
        feeManager.connect(operator).withdrawAmount(ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(feeManager, "InsufficientBalance")
    })

    it("should revert when amount is exactly balance + 1 wei", async () => {
      const balancePlusOne = depositAmount + 1n

      await expect(
        feeManager.connect(operator).withdrawAmount(balancePlusOne)
      ).to.be.revertedWithCustomError(feeManager, "InsufficientBalance")
    })

    it("should handle large amounts without overflow", async () => {
      // Send more ETH to contract
      const largeAmount = ethers.parseEther("1000")
      await owner.sendTransaction({
        to: await feeManager.getAddress(),
        value: largeAmount,
      })

      const totalBalance = depositAmount + largeAmount

      const initialClientBalance = await ethers.provider.getBalance(
        client.address
      )

      await feeManager.connect(operator).withdrawAmount(totalBalance)

      const clientAmount = (totalBalance * clientBasisPoints) / 10000n

      expect(await ethers.provider.getBalance(client.address)).to.equal(
        initialClientBalance + clientAmount
      )
      expect(
        await ethers.provider.getBalance(await feeManager.getAddress())
      ).to.equal(0n)
    })
  })

  describe("withdrawAmount without referrer", () => {
    const depositAmount = ethers.parseEther("10")
    const clientBasisPoints = 9000n // 90%
    let feeManagerNoReferrer: RewardFeeManager

    beforeEach(async () => {
      // Setup client WITHOUT referrer
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

      feeManagerNoReferrer = await ethers.getContractAt(
        "RewardFeeManager",
        feeManagerAddress
      )

      // Send ETH to the contract
      await owner.sendTransaction({
        to: await feeManagerNoReferrer.getAddress(),
        value: depositAmount,
      })
    })

    it("should split funds correctly without referrer", async () => {
      const withdrawAmount = ethers.parseEther("5")

      const initialServiceBalance = await ethers.provider.getBalance(
        service.address
      )
      const initialClientBalance = await ethers.provider.getBalance(
        client.address
      )

      await feeManagerNoReferrer.connect(operator).withdrawAmount(withdrawAmount)

      const clientAmount = (withdrawAmount * clientBasisPoints) / 10000n
      const serviceAmount = withdrawAmount - clientAmount // No referrer share

      expect(await ethers.provider.getBalance(client.address)).to.equal(
        initialClientBalance + clientAmount
      )
      expect(await ethers.provider.getBalance(service.address)).to.equal(
        initialServiceBalance + serviceAmount
      )
    })

    it("should emit Withdrawn event with zero referrer amount", async () => {
      const withdrawAmount = ethers.parseEther("5")

      const clientAmount = (withdrawAmount * clientBasisPoints) / 10000n
      const serviceAmount = withdrawAmount - clientAmount

      await expect(
        feeManagerNoReferrer.connect(operator).withdrawAmount(withdrawAmount)
      )
        .to.emit(feeManagerNoReferrer, "Withdrawn")
        .withArgs(serviceAmount, clientAmount, 0n)
    })
  })

  describe("withdrawAmount with different basis points", () => {
    const depositAmount = ethers.parseEther("10")

    it("should split correctly with 50/50 client/service (no referrer)", async () => {
      const clientBasisPoints = 5000n // 50%

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

      const feeManager5050 = await ethers.getContractAt(
        "RewardFeeManager",
        feeManagerAddress
      )

      await owner.sendTransaction({
        to: await feeManager5050.getAddress(),
        value: depositAmount,
      })

      const withdrawAmount = ethers.parseEther("4")
      const initialClientBalance = await ethers.provider.getBalance(client.address)
      const initialServiceBalance = await ethers.provider.getBalance(service.address)

      await feeManager5050.connect(operator).withdrawAmount(withdrawAmount)

      const clientAmount = (withdrawAmount * clientBasisPoints) / 10000n // 2 ETH
      const serviceAmount = withdrawAmount - clientAmount // 2 ETH

      expect(await ethers.provider.getBalance(client.address)).to.equal(
        initialClientBalance + clientAmount
      )
      expect(await ethers.provider.getBalance(service.address)).to.equal(
        initialServiceBalance + serviceAmount
      )
    })

    it("should split correctly with low client basis points", async () => {
      const clientBasisPoints = 100n // 1%
      const referrerBasisPoints = 50n // 0.5%

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

      const feeManagerLow = await ethers.getContractAt(
        "RewardFeeManager",
        feeManagerAddress
      )

      await owner.sendTransaction({
        to: await feeManagerLow.getAddress(),
        value: depositAmount,
      })

      const withdrawAmount = ethers.parseEther("10")
      const initialClientBalance = await ethers.provider.getBalance(client.address)
      const initialServiceBalance = await ethers.provider.getBalance(service.address)
      const initialReferrerBalance = await ethers.provider.getBalance(referrer.address)

      await feeManagerLow.connect(operator).withdrawAmount(withdrawAmount)

      const clientAmount = (withdrawAmount * clientBasisPoints) / 10000n // 0.1 ETH
      const referrerAmount = (withdrawAmount * referrerBasisPoints) / 10000n // 0.05 ETH
      const serviceAmount = withdrawAmount - clientAmount - referrerAmount // 9.85 ETH

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

    it("should split correctly with high referrer basis points", async () => {
      const clientBasisPoints = 4000n // 40%
      const referrerBasisPoints = 4000n // 40%

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

      const feeManagerHighRef = await ethers.getContractAt(
        "RewardFeeManager",
        feeManagerAddress
      )

      await owner.sendTransaction({
        to: await feeManagerHighRef.getAddress(),
        value: depositAmount,
      })

      const withdrawAmount = ethers.parseEther("5")
      const initialClientBalance = await ethers.provider.getBalance(client.address)
      const initialServiceBalance = await ethers.provider.getBalance(service.address)
      const initialReferrerBalance = await ethers.provider.getBalance(referrer.address)

      await feeManagerHighRef.connect(operator).withdrawAmount(withdrawAmount)

      const clientAmount = (withdrawAmount * clientBasisPoints) / 10000n // 2 ETH
      const referrerAmount = (withdrawAmount * referrerBasisPoints) / 10000n // 2 ETH
      const serviceAmount = withdrawAmount - clientAmount - referrerAmount // 1 ETH

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
  })
})
