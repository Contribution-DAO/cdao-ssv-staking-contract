import { expect } from "chai"
import { ethers } from "hardhat"
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { RewardFeeManager, FeeManagerFactory } from "../typechain-types"
import { deployContractsFixture } from "./fixtures/deployContracts"
import { defaultClientBasisPoints, nativeDeposit } from "./constants"

describe("FeeManagerFactory", () => {
  let rewardFeeManager: RewardFeeManager
  let feeManagerFactory: FeeManagerFactory
  let owner: any
  let client: any
  let otherAccount: any

  beforeEach(async () => {
    const fixture = await loadFixture(deployContractsFixture)
    rewardFeeManager = fixture.rewardFeeManager
    feeManagerFactory = fixture.feeManagerFactory
    owner = fixture.owner
    client = fixture.client
    otherAccount = fixture.otherAccount
  })

  describe("Initialization", () => {
    it("should set the correct default client basis points", async () => {
      expect(await feeManagerFactory.defaultClientBasisPoints()).to.equal(
        defaultClientBasisPoints
      )
    })

    it("should revert when initializing with invalid default basis points", async () => {
      const FeeManagerFactory = await ethers.getContractFactory(
        "FeeManagerFactory"
      )
      await expect(
        FeeManagerFactory.deploy(10000n)
      ).to.be.revertedWithCustomError(
        feeManagerFactory,
        "InvalidDefaultClientBasisPoints"
      )
    })
  })

  describe("Access Control", () => {
    it("should allow owner to set gatewayEth2Deposit", async () => {
      const GatewayEth2Deposit = await ethers.getContractFactory(
        "GatewayEth2Deposit"
      )
      const newGatewayEth2Deposit = await GatewayEth2Deposit.deploy(
        await feeManagerFactory.getAddress(),
        nativeDeposit
      )
      await feeManagerFactory
        .connect(owner)
        .setGatewayEth2Deposit(newGatewayEth2Deposit)
      expect(await feeManagerFactory.gatewayEth2Deposit()).to.equal(
        newGatewayEth2Deposit
      )
    })

    it("should revert when non-owner tries to set gatewayEth2Deposit", async () => {
      const newGatewayEth2Deposit = await feeManagerFactory.getAddress()
      await expect(
        feeManagerFactory
          .connect(otherAccount)
          .setGatewayEth2Deposit(newGatewayEth2Deposit)
      ).to.be.revertedWithCustomError(feeManagerFactory, "CallerNotOwner")
    })

    it("should allow owner to set defaultClientBasisPoints", async () => {
      const newBasisPoints = 5000n
      await feeManagerFactory
        .connect(owner)
        .setDefaultClientBasisPoints(newBasisPoints)
      expect(await feeManagerFactory.defaultClientBasisPoints()).to.equal(
        newBasisPoints
      )
    })

    it("should revert when non-owner tries to set defaultClientBasisPoints", async () => {
      await expect(
        feeManagerFactory
          .connect(otherAccount)
          .setDefaultClientBasisPoints(5000n)
      ).to.be.revertedWithCustomError(feeManagerFactory, "CallerNotOwner")
    })
  })

  describe("FeeManager Creation", () => {
    it("should create a new FeeManager with client config", async () => {
      const clientBasisPoints = 9000n
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

      await expect(tx).to.emit(feeManagerFactory, "FeeManagerCreated")
    })

    it("should use default basis points when client basis points is 0", async () => {
      const tx = await feeManagerFactory.connect(owner).createFeeManager(
        await rewardFeeManager.getAddress(),
        {
          recipient: client.address,
          basisPoints: 0n,
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

      expect(await feeManager.clientBasisPoints()).to.equal(
        defaultClientBasisPoints
      )
    })

    it("should revert when reference fee manager is zero address", async () => {
      await expect(
        feeManagerFactory.connect(owner).createFeeManager(
          ethers.ZeroAddress,
          {
            recipient: client.address,
            basisPoints: 9000n,
          },
          {
            recipient: ethers.ZeroAddress,
            basisPoints: 0n,
          }
        )
      ).to.be.revertedWithCustomError(
        feeManagerFactory,
        "ReferenceFeeManagerNotSet"
      )
    })
  })

  describe("FeeManager Tracking", () => {
    let feeManagerAddress: string

    beforeEach(async () => {
      const tx = await feeManagerFactory.connect(owner).createFeeManager(
        await rewardFeeManager.getAddress(),
        {
          recipient: client.address,
          basisPoints: 9000n,
        },
        {
          recipient: ethers.ZeroAddress,
          basisPoints: 0n,
        }
      )
      const receipt = await tx.wait()
      const event: any = receipt?.logs[0]
      feeManagerAddress = event?.address
    })

    it("should track client fee managers correctly", async () => {
      const clientFeeManagers = await feeManagerFactory.allClientFeeManagers(
        client.address
      )
      expect(clientFeeManagers).to.include(feeManagerAddress)
    })

    it("should track all fee managers correctly", async () => {
      const allFeeManagers = await feeManagerFactory.allFeeManagers()
      expect(allFeeManagers).to.include(feeManagerAddress)
    })
  })

  describe("Address Prediction", () => {
    it("should correctly predict fee manager address", async () => {
      const clientConfig = {
        recipient: client.address,
        basisPoints: 9000n,
      }
      const referrerConfig = {
        recipient: ethers.ZeroAddress,
        basisPoints: 0n,
      }

      const predictedAddress = await feeManagerFactory.predictFeeManagerAddress(
        await rewardFeeManager.getAddress(),
        clientConfig,
        referrerConfig
      )

      const tx = await feeManagerFactory
        .connect(owner)
        .createFeeManager(
          await rewardFeeManager.getAddress(),
          clientConfig,
          referrerConfig
        )
      const receipt = await tx.wait()
      const event: any = receipt?.logs[0]
      const actualAddress = event?.address

      expect(predictedAddress).to.equal(actualAddress)
    })
  })
})
