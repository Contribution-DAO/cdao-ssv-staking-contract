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
    const feeManagerAddress = await rewardFeeManager.getAddress()

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

    it("Should revert when EIP-7251 not enabled and using non-standard amount", async function () {
      const {
        withdrawalCredentials,
        feeManagerAddress,
        clientConfig,
        referrerConfig,
      } = await setupAddEthParams()

      const nonStandardAmount = ethers.parseEther("33")

      await expect(
        gatewayEth2Deposit.addEth(
          withdrawalCredentials,
          nonStandardAmount,
          feeManagerAddress,
          client.address,
          clientConfig,
          referrerConfig,
          "0x",
          { value: nonStandardAmount }
        )
      ).to.be.revertedWithCustomError(
        gatewayEth2Deposit,
        "Eip7251NotEnabledYet"
      )
    })

    it("Should revert when withdrawal credentials bytes not zero", async function () {
      const {
        ethAmountPerValidator,
        feeManagerAddress,
        clientConfig,
        referrerConfig,
      } = await setupAddEthParams()

      // Create withdrawal credentials with non-zero bytes in the middle
      const nonZeroBytes = new Uint8Array(32)
      nonZeroBytes[0] = 0x01
      nonZeroBytes[2] = 0x01 // Non-zero byte in the middle
      const invalidWithdrawalCredentials = ethers.hexlify(nonZeroBytes)

      await expect(
        gatewayEth2Deposit.addEth(
          invalidWithdrawalCredentials,
          ethAmountPerValidator,
          feeManagerAddress,
          client.address,
          clientConfig,
          referrerConfig,
          "0x",
          { value: ethAmountPerValidator }
        )
      ).to.be.revertedWithCustomError(
        gatewayEth2Deposit,
        "WithdrawalCredentialsBytesNotZero"
      )
    })

    it("Should revert when eth amount per validator is out of range", async function () {
      const {
        withdrawalCredentials,
        feeManagerAddress,
        clientConfig,
        referrerConfig,
      } = await setupAddEthParams()

      await gatewayEth2Deposit.enableEip7251()

      const tooSmallAmount = ethers.parseEther("31")
      await expect(
        gatewayEth2Deposit.addEth(
          withdrawalCredentials,
          tooSmallAmount,
          feeManagerAddress,
          client.address,
          clientConfig,
          referrerConfig,
          "0x",
          { value: tooSmallAmount }
        )
      ).to.be.revertedWithCustomError(
        gatewayEth2Deposit,
        "EthAmountPerValidatorInWeiOutOfRange"
      )

      const tooLargeAmount = ethers.parseEther("2049")
      await expect(
        gatewayEth2Deposit.addEth(
          withdrawalCredentials,
          tooLargeAmount,
          feeManagerAddress,
          client.address,
          clientConfig,
          referrerConfig,
          "0x",
          { value: tooLargeAmount }
        )
      ).to.be.revertedWithCustomError(
        gatewayEth2Deposit,
        "EthAmountPerValidatorInWeiOutOfRange"
      )
    })

    it("Should allow multiple deposits for the same withdrawal credentials", async function () {
      const {
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        clientConfig,
        referrerConfig,
      } = await setupAddEthParams()

      // First deposit
      await gatewayEth2Deposit.addEth(
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        client.address,
        clientConfig,
        referrerConfig,
        "0x",
        { value: ethAmountPerValidator }
      )

      // Second deposit
      await expect(
        gatewayEth2Deposit.addEth(
          withdrawalCredentials,
          ethAmountPerValidator,
          feeManagerAddress,
          client.address,
          clientConfig,
          referrerConfig,
          "0x",
          { value: ethAmountPerValidator }
        )
      ).to.emit(gatewayEth2Deposit, "ClientEthAdded")
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

    it("Should successfully reject service and emit event", async function () {
      const {
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        clientConfig,
        referrerConfig,
      } = await setupAddEthParams()

      await gatewayEth2Deposit.addEth(
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        client.address,
        clientConfig,
        referrerConfig,
        "0x",
        { value: ethAmountPerValidator }
      )

      const depositId = await gatewayEth2Deposit[
        "getDepositId(bytes32,uint96,address,(uint96,address),(uint96,address))"
      ](
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        clientConfig,
        referrerConfig
      )

      const reason = "Test rejection reason"
      await expect(
        gatewayEth2Deposit.connect(owner).rejectService(depositId, reason)
      )
        .to.emit(gatewayEth2Deposit, "ServiceRejected")
        .withArgs(depositId, reason)

      const deposit = await gatewayEth2Deposit.depositData(depositId)
      expect(deposit.status).to.equal(3) // ServiceRejected status
      expect(deposit.expiration).to.equal(0)
    })

    it("Should allow immediate refund after rejection", async function () {
      const {
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        clientConfig,
        referrerConfig,
      } = await setupAddEthParams()

      // Add ETH first
      await gatewayEth2Deposit.addEth(
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        client.address,
        clientConfig,
        referrerConfig,
        "0x",
        { value: ethAmountPerValidator }
      )

      const depositId = await gatewayEth2Deposit[
        "getDepositId(bytes32,uint96,address,(uint96,address),(uint96,address))"
      ](
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        clientConfig,
        referrerConfig
      )

      // Reject the service
      await gatewayEth2Deposit
        .connect(owner)
        .rejectService(depositId, "Rejected")

      const clientFeeManagerAddress =
        await feeManagerFactory.predictFeeManagerAddress(
          feeManagerAddress,
          clientConfig,
          referrerConfig
        )

      // Should allow immediate refund
      await expect(
        gatewayEth2Deposit
          .connect(client)
          .refund(
            withdrawalCredentials,
            ethAmountPerValidator,
            clientFeeManagerAddress
          )
      ).to.emit(gatewayEth2Deposit, "Refund")
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
      depositId = event?.args?.address
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

    it("Should successfully refund after expiration", async function () {
      const {
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        clientConfig,
        referrerConfig,
      } = await setupAddEthParams()

      // Add ETH first
      await gatewayEth2Deposit
        .connect(client)
        .addEth(
          withdrawalCredentials,
          ethAmountPerValidator,
          feeManagerAddress,
          client.address,
          clientConfig,
          referrerConfig,
          "0x",
          { value: ethAmountPerValidator }
        )

      // Increase time to pass expiration
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]) // 7 days
      await ethers.provider.send("evm_mine", [])

      const clientFeeManagerAddress =
        await feeManagerFactory.predictFeeManagerAddress(
          feeManagerAddress,
          clientConfig,
          referrerConfig
        )

      await expect(
        gatewayEth2Deposit
          .connect(operator)
          .refund(
            withdrawalCredentials,
            ethAmountPerValidator,
            clientFeeManagerAddress
          )
      ).to.emit(gatewayEth2Deposit, "Refund")
    })

    it("Should revert refund with insufficient balance", async function () {
      const {
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        clientConfig,
        referrerConfig,
      } = await setupAddEthParams()

      // Add ETH first
      await gatewayEth2Deposit.addEth(
        withdrawalCredentials,
        ethAmountPerValidator,
        feeManagerAddress,
        client.address,
        clientConfig,
        referrerConfig,
        "0x",
        { value: ethAmountPerValidator }
      )

      // Try to refund without any deposit
      await expect(
        gatewayEth2Deposit
          .connect(operator)
          .refund(
            withdrawalCredentials,
            ethAmountPerValidator,
            feeManagerAddress
          )
      ).to.be.revertedWithCustomError(gatewayEth2Deposit, "InsufficientBalance")
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

      const clientFeeManagerAddress =
        await feeManagerFactory.predictFeeManagerAddress(
          feeManagerAddress,
          setupParams.clientConfig,
          setupParams.referrerConfig
        )

      depositId = await gatewayEth2Deposit[
        "getDepositId(bytes32,uint96,address)"
      ](withdrawalCredentials, ethAmountPerValidator, clientFeeManagerAddress)
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
