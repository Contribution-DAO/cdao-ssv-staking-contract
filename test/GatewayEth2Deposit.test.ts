import { expect } from "chai"
import { ethers } from "hardhat"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { deployContractsFixture } from "./fixtures/deployContracts"
import { FeeManagerFactory, GatewayEth2Deposit } from "../typechain-types"
import { nativeDeposit } from "./constants"
import { addressToWithdrawalCredentials } from "./helpers"
import { RewardFeeManager } from "../typechain-types"

describe("GatewayEth2Deposit", function () {
  let gatewayEth2Deposit: GatewayEth2Deposit
  let feeManagerFactory: FeeManagerFactory
  let rewardFeeManager: RewardFeeManager
  let owner: any
  let client: any
  let operator: any
  let otherAccount: any

  const setupAddEthParams = async () => {
    const withdrawalCredentials = addressToWithdrawalCredentials(client.address)
    const ethAmountPerValidator = ethers.parseEther("32")
    const clientConfig = {
      recipient: client.address,
      basisPoints: 9000,
    }
    const referrerConfig = {
      recipient: ethers.ZeroAddress,
      basisPoints: 0,
    }
    const referenceFeeManagerTx = await feeManagerFactory
      .connect(owner)
      .createFeeManager(
        await rewardFeeManager.getAddress(),
        clientConfig,
        referrerConfig
      )
    const receipt = await referenceFeeManagerTx.wait()
    const event: any = receipt?.logs[0]
    const feeManagerAddress = event?.address

    return {
      withdrawalCredentials,
      ethAmountPerValidator,
      feeManagerAddress,
      clientConfig,
      referrerConfig,
    }
  }

  beforeEach(async () => {
    const fixture = await loadFixture(deployContractsFixture)
    gatewayEth2Deposit = fixture.gatewayEth2Deposit
    feeManagerFactory = fixture.feeManagerFactory
    rewardFeeManager = fixture.rewardFeeManager
    owner = fixture.owner
    client = fixture.client
    operator = fixture.operator
    otherAccount = fixture.otherAccount
  })

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await gatewayEth2Deposit.owner()).to.equal(owner.address)
    })

    it("Should set the right feeManagerFactory", async function () {
      expect(await gatewayEth2Deposit.getFeeManagerFactory()).to.equal(
        await feeManagerFactory.getAddress()
      )
    })

    it("Should set the right depositContract", async function () {
      expect(await gatewayEth2Deposit.getDepositContract()).to.equal(
        nativeDeposit
      )
    })
  })

  describe("EIP-7251", function () {
    it("Should not be enabled by default", async function () {
      expect(await gatewayEth2Deposit.eip7251Enabled()).to.be.false
    })

    it("Should only allow owner to enable EIP-7251", async function () {
      await expect(
        gatewayEth2Deposit.connect(client).enableEip7251()
      ).to.be.revertedWithCustomError(
        gatewayEth2Deposit,
        "CallerNotEip7251Enabler"
      )
    })

    it("Should enable EIP-7251 when called by owner", async function () {
      await gatewayEth2Deposit.connect(owner).enableEip7251()
      expect(await gatewayEth2Deposit.eip7251Enabled()).to.be.true
    })
  })

  describe("addEth", function () {
    const setupAddEthParams = async () => {
      const withdrawalCredentials = addressToWithdrawalCredentials(
        client.address
      )
      const ethAmountPerValidator = ethers.parseEther("32")
      const clientConfig = {
        recipient: client.address,
        basisPoints: 9000,
      }
      const referrerConfig = {
        recipient: ethers.ZeroAddress,
        basisPoints: 0,
      }
      const referenceFeeManagerTx = await feeManagerFactory
        .connect(owner)
        .createFeeManager(
          await rewardFeeManager.getAddress(),
          clientConfig,
          referrerConfig
        )
      const receipt = await referenceFeeManagerTx.wait()
      const event: any = receipt?.logs[0]
      const feeManagerAddress = event?.address

      return {
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        clientConfig,
        referrerConfig,
      }
    }

    it("Should revert when sending ETH directly", async function () {
      await expect(
        client.sendTransaction({
          to: await gatewayEth2Deposit.getAddress(),
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(
        gatewayEth2Deposit,
        "DoNotSendEthDirectlyHere"
      )
    })

    it("Should revert with deposits less than MIN_DEPOSIT", async function () {
      const {
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        clientConfig,
        referrerConfig,
      } = await setupAddEthParams()

      await expect(
        gatewayEth2Deposit.addEth(
          withdrawalCredentials,
          ethAmountPerValidator,
          feeManagerAddress,
          client.address,
          clientConfig,
          referrerConfig,
          "0x",
          { value: ethers.parseEther("0.1") }
        )
      ).to.be.revertedWithCustomError(gatewayEth2Deposit, "NoSmallDeposits")
    })

    it("Should revert with incorrect withdrawal credentials prefix", async function () {
      const {
        ethAmountPerValidator,
        feeManagerAddress,
        clientConfig,
        referrerConfig,
      } = await setupAddEthParams()

      const randomBytes = ethers.randomBytes(31)
      const invalidWithdrawalCredentials = ethers.concat(["0x03", randomBytes])

      await gatewayEth2Deposit.enableEip7251()

      await expect(
        gatewayEth2Deposit.addEth(
          invalidWithdrawalCredentials,
          ethAmountPerValidator,
          feeManagerAddress,
          client.address,
          clientConfig,
          referrerConfig,
          "0x",
          { value: ethers.parseEther("32") }
        )
      ).to.be.revertedWithCustomError(
        gatewayEth2Deposit,
        "IncorrectWithdrawalCredentialsPrefix"
      )
    })

    it("Should successfully add ETH with valid parameters", async function () {
      const {
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        clientConfig,
        referrerConfig,
      } = await setupAddEthParams()

      const tx = await gatewayEth2Deposit.addEth(
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        client.address,
        clientConfig,
        referrerConfig,
        "0x",
        { value: ethers.parseEther("32") }
      )

      await expect(tx).to.emit(gatewayEth2Deposit, "ClientEthAdded")
    })
  })

  describe("rejectService", function () {
    it("Should revert if caller is not operator or owner", async function () {
      const depositId = ethers.hexlify(ethers.randomBytes(32))

      await expect(
        gatewayEth2Deposit.connect(client).rejectService(depositId, "Rejected")
      ).to.be.reverted
    })

    it("Should revert if deposit does not exist", async function () {
      const depositId = ethers.hexlify(ethers.randomBytes(32))

      await expect(
        gatewayEth2Deposit.connect(owner).rejectService(depositId, "Rejected")
      ).to.be.revertedWithCustomError(gatewayEth2Deposit, "NoDepositToReject")
    })
  })

  describe("refund", function () {
    let depositId: string
    let withdrawalCredentials: string
    let ethAmountPerValidator: bigint
    let feeManagerAddress: string

    beforeEach(async () => {
      const setupParams = await setupAddEthParams()
      withdrawalCredentials = setupParams.withdrawalCredentials
      ethAmountPerValidator = setupParams.ethAmountPerValidator
      feeManagerAddress = setupParams.feeManagerAddress

      // Add ETH first
      const addEthTx = await gatewayEth2Deposit.addEth(
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        client.address,
        setupParams.clientConfig,
        setupParams.referrerConfig,
        "0x",
        { value: ethers.parseEther("32") }
      )

      const receipt = await addEthTx.wait()
      const event: any = receipt?.logs[0]
      depositId = event?.args?._depositId
    })

    it("Should revert if called before expiration", async function () {
      await expect(
        gatewayEth2Deposit.refund(
          withdrawalCredentials,
          ethAmountPerValidator,
          feeManagerAddress
        )
      ).to.be.reverted
    })

    it("Should revert if caller is not client", async function () {
      await expect(
        gatewayEth2Deposit
          .connect(otherAccount)
          .refund(
            withdrawalCredentials,
            ethAmountPerValidator,
            feeManagerAddress
          )
      ).to.be.revertedWithCustomError(gatewayEth2Deposit, "CallerNotClient")
    })
  })

  describe("makeBeaconDeposit", function () {
    let withdrawalCredentials: string
    let ethAmountPerValidator: bigint
    let feeManagerAddress: string

    beforeEach(async () => {
      const setupParams = await setupAddEthParams()
      withdrawalCredentials = setupParams.withdrawalCredentials
      ethAmountPerValidator = setupParams.ethAmountPerValidator

      // Add ETH first
      await gatewayEth2Deposit.addEth(
        withdrawalCredentials,
        ethAmountPerValidator,
        await rewardFeeManager.getAddress(),
        client.address,
        setupParams.clientConfig,
        setupParams.referrerConfig,
        "0x",
        { value: ethers.parseEther("32") }
      )

      feeManagerAddress = await feeManagerFactory.predictFeeManagerAddress(
        await rewardFeeManager.getAddress(),
        setupParams.clientConfig,
        setupParams.referrerConfig
      )
    })

    it("Should revert if caller is not operator or owner", async function () {
      await expect(
        gatewayEth2Deposit
          .connect(client)
          .makeBeaconDeposit(
            withdrawalCredentials,
            ethAmountPerValidator,
            feeManagerAddress,
            [],
            [],
            []
          )
      ).to.be.reverted
    })

    it("Should revert with invalid validator count", async function () {
      await expect(
        gatewayEth2Deposit
          .connect(owner)
          .makeBeaconDeposit(
            withdrawalCredentials,
            ethAmountPerValidator,
            feeManagerAddress,
            [],
            [],
            []
          )
      ).to.be.revertedWithCustomError(gatewayEth2Deposit, "ValidatorCountError")
    })

    it("Should revert with mismatched parameter lengths", async function () {
      const pubkeys = [ethers.hexlify(ethers.randomBytes(48))]
      const signatures = [ethers.hexlify(ethers.randomBytes(96))]
      const depositDataRoots: string[] = []

      await expect(
        gatewayEth2Deposit
          .connect(owner)
          .makeBeaconDeposit(
            withdrawalCredentials,
            ethAmountPerValidator,
            feeManagerAddress,
            pubkeys,
            signatures,
            depositDataRoots
          )
      ).to.be.revertedWithCustomError(
        gatewayEth2Deposit,
        "AmountOfParametersError"
      )
    })
  })

  describe("View functions", function () {
    let depositId: string
    let withdrawalCredentials: string
    let ethAmountPerValidator: bigint
    let feeManagerAddress: string

    beforeEach(async () => {
      const setupParams = await setupAddEthParams()
      withdrawalCredentials = setupParams.withdrawalCredentials
      ethAmountPerValidator = setupParams.ethAmountPerValidator
      feeManagerAddress = setupParams.feeManagerAddress

      // Add ETH first
      await gatewayEth2Deposit.addEth(
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        client.address,
        setupParams.clientConfig,
        setupParams.referrerConfig,
        "0x",
        { value: ethers.parseEther("32") }
      )

      depositId = await gatewayEth2Deposit[
        "getDepositId(bytes32,uint96,address,(uint96,address),(uint96,address))"
      ](
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        setupParams.clientConfig,
        setupParams.referrerConfig
      )
    })

    it("Should return correct total balance", async function () {
      expect(await gatewayEth2Deposit.totalBalance()).to.equal(
        ethers.parseEther("32")
      )
    })

    it("Should return correct deposit amount", async function () {
      expect(await gatewayEth2Deposit.depositAmount(depositId)).to.equal(
        ethers.parseEther("32")
      )
    })

    it("Should return correct deposit status", async function () {
      expect(await gatewayEth2Deposit.depositStatus(depositId)).to.equal(1) // EthAdded status
    })

    it("Should return correct deposit data", async function () {
      const depositData = await gatewayEth2Deposit.depositData(depositId)
      expect(depositData.amount).to.equal(ethers.parseEther("32"))
      expect(depositData.status).to.equal(1) // EthAdded status
    })
  })
})
