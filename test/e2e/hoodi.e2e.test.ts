import { expect } from "chai"
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers"
import { ethers } from "hardhat"
import {
  SSVProxyFactory,
  FeeManagerFactory,
  GatewayEth2Deposit,
} from "../../typechain-types"
import { deployOnForkFixture } from "./fixtures/deployOnFork"
import {
  HOODI_SSV_NETWORK,
  HOODI_SSV_VIEWS,
  HOODI_DEPOSIT_CONTRACT,
  OPERATOR_IDS,
  DEFAULT_CLIENT_BASIS_POINTS,
  ETH_PER_VALIDATOR,
  EMPTY_CLUSTER,
  MOCK_SHARES,
} from "./constants/hoodi"
import { generateTestDepositData } from "./helpers/depositData"

// Only run when FORK_HOODI=true
const describeOrSkip =
  process.env.FORK_HOODI === "true" ? describe : describe.skip

describeOrSkip("E2E: Hoodi Fork", function () {
  this.timeout(120_000) // Fork tests need more time

  let ssvProxyFactory: SSVProxyFactory
  let feeManagerFactory: FeeManagerFactory
  let gatewayEth2Deposit: GatewayEth2Deposit
  let owner: any
  let service: any
  let client: any
  let referrer: any
  let operator: any

  beforeEach(async function () {
    const fixture = await loadFixture(deployOnForkFixture)
    ssvProxyFactory = fixture.ssvProxyFactory
    feeManagerFactory = fixture.feeManagerFactory
    gatewayEth2Deposit = fixture.gatewayEth2Deposit
    owner = fixture.owner
    service = fixture.service
    client = fixture.client
    referrer = fixture.referrer
    operator = fixture.operator
  })

  // Helper: convert frozen ethers Result cluster to plain object
  function toClusterObject(cluster: any) {
    return {
      validatorCount: cluster.validatorCount,
      networkFeeIndex: cluster.networkFeeIndex,
      index: cluster.index,
      active: cluster.active,
      balance: cluster.balance,
    }
  }

  // Helper: build withdrawal credentials bytes32 from address
  function withdrawalCredentialsBytes32(address: string): string {
    return (
      "0x010000000000000000000000" + address.slice(2).toLowerCase()
    )
  }

  // Helper: create SSVProxy via addEth
  async function addEthFlow(ethAmount?: bigint) {
    const amount = ethAmount ?? ETH_PER_VALIDATOR
    const withdrawalCreds = withdrawalCredentialsBytes32(client.address)

    const clientConfig = {
      recipient: client.address,
      basisPoints: DEFAULT_CLIENT_BASIS_POINTS,
    }
    const referrerConfig = {
      recipient: referrer.address,
      basisPoints: 500n,
    }

    const tx = await ssvProxyFactory.connect(client).addEth(
      withdrawalCreds,
      ETH_PER_VALIDATOR,
      clientConfig,
      referrerConfig,
      "0x",
      { value: amount }
    )
    const receipt = await tx.wait()

    // Get the feeManagerInstance and ssvProxy from return values
    // We need to decode from the EthForSsvStakingDeposited event
    const iface = ssvProxyFactory.interface
    const depositEvent = receipt!.logs
      .map((log: any) => {
        try {
          return iface.parseLog({ topics: log.topics, data: log.data })
        } catch {
          return null
        }
      })
      .find((e: any) => e?.name === "EthForSsvStakingDeposited")

    const feeManagerInstance = depositEvent!.args._feeManagerInstance
    const ssvProxy = depositEvent!.args._ssvProxy

    return {
      withdrawalCreds,
      clientConfig,
      referrerConfig,
      feeManagerInstance,
      ssvProxy,
      receipt,
      depositEvent,
    }
  }

  describe("addEth flow", () => {
    it("should deposit ETH and create SSVProxy + FeeManager", async () => {
      const { feeManagerInstance, ssvProxy } = await addEthFlow()

      // SSVProxy should be deployed
      const proxyCode = await ethers.provider.getCode(ssvProxy)
      expect(proxyCode).to.not.equal("0x")

      // FeeManager should be deployed
      const fmCode = await ethers.provider.getCode(feeManagerInstance)
      expect(fmCode).to.not.equal("0x")

      // Client should have the proxy tracked
      const clientProxies = await ssvProxyFactory.getAllClientSsvProxies(
        client.address
      )
      expect(clientProxies.length).to.equal(1)
      expect(clientProxies[0]).to.equal(ssvProxy)
    })

    it("should emit EthForSsvStakingDeposited event with correct data", async () => {
      const { depositEvent } = await addEthFlow()

      expect(depositEvent).to.not.be.null
      expect(depositEvent!.args._clientAddress).to.equal(client.address)
      expect(depositEvent!.args._referrerAddress).to.equal(referrer.address)
      expect(depositEvent!.args._ethAmountInWei).to.equal(ETH_PER_VALIDATOR)
    })

    it("should set SSVProxy as whitelisted in SSVProxyFactory", async () => {
      const { ssvProxy } = await addEthFlow()

      const isWhitelisted = await ssvProxyFactory.isWhitelisted(ssvProxy, 0)
      expect(isWhitelisted).to.be.true
    })
  })

  describe("Full registration flow", () => {
    it("should complete: addEth -> makeBeaconDeposit -> bulkRegisterValidators", async () => {
      // 1. addEth with 32 ETH
      const {
        withdrawalCreds,
        feeManagerInstance,
        ssvProxy,
      } = await addEthFlow()

      // 2. Generate deposit data for 1 validator
      const depositData = generateTestDepositData(client.address)

      // 3. Prepare SSV registration data
      const operatorIdsU64 = OPERATOR_IDS.map((id) => BigInt(id))

      // Fund for SSV cluster (msg.value for operator fees)
      const ssvClusterFunding = ethers.parseEther("0.5")

      // 4. makeBeaconDepositsAndRegisterValidators
      const tx = await ssvProxyFactory
        .connect(operator)
        .makeBeaconDepositsAndRegisterValidators(
          withdrawalCreds,
          ETH_PER_VALIDATOR,
          feeManagerInstance,
          client.address,
          {
            signatures: [depositData.signature],
            depositDataRoots: [depositData.depositDataRoot],
          },
          operatorIdsU64,
          [depositData.pubkey],
          [MOCK_SHARES],
          EMPTY_CLUSTER,
          { value: ssvClusterFunding }
        )
      const receipt = await tx.wait()

      // 5. Verify RegistrationCompleted event
      const iface = ssvProxyFactory.interface
      const regEvent = receipt!.logs
        .map((log: any) => {
          try {
            return iface.parseLog({ topics: log.topics, data: log.data })
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === "RegistrationCompleted")

      expect(regEvent).to.not.be.null
      expect(regEvent!.args._proxy).to.equal(ssvProxy)

      // 6. Verify ValidatorAdded event on SSV Network
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ValidatorAdded(address indexed owner, uint64[] operatorIds, bytes publicKey, bytes shares, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
        ],
        ethers.provider
      )

      const validatorAddedEvents = receipt!.logs
        .filter((log: any) => log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase())
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .filter((e: any) => e?.name === "ValidatorAdded")

      expect(validatorAddedEvents.length).to.be.greaterThan(0)
      expect(validatorAddedEvents[0]!.args.owner).to.equal(ssvProxy)
    })

    it("should verify cluster state via SSV Views after registration", async () => {
      // 1. addEth + register
      const { withdrawalCreds, feeManagerInstance, ssvProxy } =
        await addEthFlow()

      const depositData = generateTestDepositData(client.address)
      const operatorIdsU64 = OPERATOR_IDS.map((id) => BigInt(id))
      const ssvClusterFunding = ethers.parseEther("0.5")

      const tx = await ssvProxyFactory
        .connect(operator)
        .makeBeaconDepositsAndRegisterValidators(
          withdrawalCreds,
          ETH_PER_VALIDATOR,
          feeManagerInstance,
          client.address,
          {
            signatures: [depositData.signature],
            depositDataRoots: [depositData.depositDataRoot],
          },
          operatorIdsU64,
          [depositData.pubkey],
          [MOCK_SHARES],
          EMPTY_CLUSTER,
          { value: ssvClusterFunding }
        )
      const receipt = await tx.wait()

      // Extract the cluster from ValidatorAdded event to use with SSV Views
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ValidatorAdded(address indexed owner, uint64[] operatorIds, bytes publicKey, bytes shares, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
        ],
        ethers.provider
      )

      const validatorEvent = receipt!.logs
        .filter((log: any) => log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase())
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === "ValidatorAdded")

      expect(validatorEvent).to.not.be.null
      const clusterAfter = toClusterObject(validatorEvent!.args.cluster)

      // 2. Verify via SSV Views
      const ssvViews = new ethers.Contract(
        HOODI_SSV_VIEWS,
        [
          "function getBalance(address owner, uint64[] memory operatorIds, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) memory cluster) external view returns (uint256 balance)",
          "function getValidator(address owner, bytes calldata publicKey) external view returns (bool)",
        ],
        ethers.provider
      )

      // Validator should be active
      const isActive = await ssvViews.getValidator(
        ssvProxy,
        depositData.pubkey
      )
      expect(isActive).to.be.true

      // Cluster should have a balance
      const balance = await ssvViews.getBalance(
        ssvProxy,
        operatorIdsU64,
        clusterAfter
      )
      expect(balance).to.be.greaterThan(0n)
    })
  })

  describe("Bulk registration flow", () => {
    it("should register 2 validators in a single bulk registration", async () => {
      // 1. addEth with 64 ETH (2 validators * 32 ETH)
      const { withdrawalCreds, feeManagerInstance, ssvProxy } =
        await addEthFlow(ETH_PER_VALIDATOR * 2n)

      // 2. Generate deposit data for 2 validators
      const depositData1 = generateTestDepositData(client.address)
      const depositData2 = generateTestDepositData(client.address)
      const operatorIdsU64 = OPERATOR_IDS.map((id) => BigInt(id))
      const ssvClusterFunding = ethers.parseEther("1")

      // 3. Register both validators
      const tx = await ssvProxyFactory
        .connect(operator)
        .makeBeaconDepositsAndRegisterValidators(
          withdrawalCreds,
          ETH_PER_VALIDATOR,
          feeManagerInstance,
          client.address,
          {
            signatures: [depositData1.signature, depositData2.signature],
            depositDataRoots: [
              depositData1.depositDataRoot,
              depositData2.depositDataRoot,
            ],
          },
          operatorIdsU64,
          [depositData1.pubkey, depositData2.pubkey],
          [MOCK_SHARES, MOCK_SHARES],
          EMPTY_CLUSTER,
          { value: ssvClusterFunding }
        )
      const receipt = await tx.wait()

      // 4. Verify ValidatorAdded events - should see the bulk event
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ValidatorAdded(address indexed owner, uint64[] operatorIds, bytes publicKey, bytes shares, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
        ],
        ethers.provider
      )

      const validatorAddedEvents = receipt!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .filter((e: any) => e?.name === "ValidatorAdded")

      // bulkRegisterValidator emits one ValidatorAdded per validator
      expect(validatorAddedEvents.length).to.equal(2)
      expect(validatorAddedEvents[0]!.args.owner).to.equal(ssvProxy)
      expect(validatorAddedEvents[1]!.args.owner).to.equal(ssvProxy)

      // Final cluster should have validatorCount = 2
      const lastCluster = toClusterObject(
        validatorAddedEvents[1]!.args.cluster
      )
      expect(lastCluster.validatorCount).to.equal(2)

      // 5. Verify both validators are active via SSV Views
      const ssvViews = new ethers.Contract(
        HOODI_SSV_VIEWS,
        [
          "function getValidator(address owner, bytes calldata publicKey) external view returns (bool)",
        ],
        ethers.provider
      )
      expect(await ssvViews.getValidator(ssvProxy, depositData1.pubkey)).to.be
        .true
      expect(await ssvViews.getValidator(ssvProxy, depositData2.pubkey)).to.be
        .true
    })
  })

  describe("Second registration to existing cluster", () => {
    it("should register a second validator using updated cluster state", async () => {
      // 1. First addEth + registration (1 validator)
      const { withdrawalCreds, feeManagerInstance, ssvProxy } =
        await addEthFlow()

      const depositData1 = generateTestDepositData(client.address)
      const operatorIdsU64 = OPERATOR_IDS.map((id) => BigInt(id))

      const tx1 = await ssvProxyFactory
        .connect(operator)
        .makeBeaconDepositsAndRegisterValidators(
          withdrawalCreds,
          ETH_PER_VALIDATOR,
          feeManagerInstance,
          client.address,
          {
            signatures: [depositData1.signature],
            depositDataRoots: [depositData1.depositDataRoot],
          },
          operatorIdsU64,
          [depositData1.pubkey],
          [MOCK_SHARES],
          EMPTY_CLUSTER,
          { value: ethers.parseEther("0.5") }
        )
      const receipt1 = await tx1.wait()

      // Extract cluster state after first registration
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ValidatorAdded(address indexed owner, uint64[] operatorIds, bytes publicKey, bytes shares, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
        ],
        ethers.provider
      )

      const firstEvent = receipt1!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === "ValidatorAdded")

      const clusterAfterFirst = toClusterObject(firstEvent!.args.cluster)
      expect(clusterAfterFirst.validatorCount).to.equal(1)

      // 2. Second addEth (for second validator's beacon deposit)
      await ssvProxyFactory.connect(client).addEth(
        withdrawalCreds,
        ETH_PER_VALIDATOR,
        {
          recipient: client.address,
          basisPoints: DEFAULT_CLIENT_BASIS_POINTS,
        },
        { recipient: referrer.address, basisPoints: 500n },
        "0x",
        { value: ETH_PER_VALIDATOR }
      )

      // 3. Register second validator with updated cluster state
      const depositData2 = generateTestDepositData(client.address)

      const tx2 = await ssvProxyFactory
        .connect(operator)
        .makeBeaconDepositsAndRegisterValidators(
          withdrawalCreds,
          ETH_PER_VALIDATOR,
          feeManagerInstance,
          client.address,
          {
            signatures: [depositData2.signature],
            depositDataRoots: [depositData2.depositDataRoot],
          },
          operatorIdsU64,
          [depositData2.pubkey],
          [MOCK_SHARES],
          clusterAfterFirst, // <-- use updated cluster, not EMPTY_CLUSTER
          { value: ethers.parseEther("0.5") }
        )
      const receipt2 = await tx2.wait()

      // 4. Verify second registration succeeded
      const secondEvent = receipt2!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === "ValidatorAdded")

      expect(secondEvent).to.not.be.null
      const clusterAfterSecond = toClusterObject(secondEvent!.args.cluster)
      expect(clusterAfterSecond.validatorCount).to.equal(2)

      // 5. Both validators should be active
      const ssvViews = new ethers.Contract(
        HOODI_SSV_VIEWS,
        [
          "function getValidator(address owner, bytes calldata publicKey) external view returns (bool)",
        ],
        ethers.provider
      )
      expect(await ssvViews.getValidator(ssvProxy, depositData1.pubkey)).to.be
        .true
      expect(await ssvViews.getValidator(ssvProxy, depositData2.pubkey)).to.be
        .true
    })
  })

  describe("Post-registration operations", () => {
    // Helper: register a validator and return the cluster + proxy
    async function registerValidator() {
      const { withdrawalCreds, feeManagerInstance, ssvProxy } =
        await addEthFlow()

      const depositData = generateTestDepositData(client.address)
      const operatorIdsU64 = OPERATOR_IDS.map((id) => BigInt(id))
      const ssvClusterFunding = ethers.parseEther("0.5")

      const tx = await ssvProxyFactory
        .connect(operator)
        .makeBeaconDepositsAndRegisterValidators(
          withdrawalCreds,
          ETH_PER_VALIDATOR,
          feeManagerInstance,
          client.address,
          {
            signatures: [depositData.signature],
            depositDataRoots: [depositData.depositDataRoot],
          },
          operatorIdsU64,
          [depositData.pubkey],
          [MOCK_SHARES],
          EMPTY_CLUSTER,
          { value: ssvClusterFunding }
        )
      const receipt = await tx.wait()

      // Extract cluster from ValidatorAdded
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ValidatorAdded(address indexed owner, uint64[] operatorIds, bytes publicKey, bytes shares, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
        ],
        ethers.provider
      )

      const validatorEvent = receipt!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === "ValidatorAdded")

      return {
        ssvProxy,
        feeManagerInstance,
        depositData,
        operatorIdsU64,
        cluster: toClusterObject(validatorEvent!.args.cluster),
      }
    }

    it("should allow depositing additional ETH to SSV cluster", async () => {
      const { ssvProxy, operatorIdsU64, cluster } = await registerValidator()

      const additionalFunding = ethers.parseEther("0.1")

      await expect(
        ssvProxyFactory
          .connect(owner)
          .depositToSSV(ssvProxy, operatorIdsU64, cluster, {
            value: additionalFunding,
          })
      ).to.not.be.reverted
    })

    it("should allow setting fee recipient on SSVProxy", async () => {
      const { ssvProxy, feeManagerInstance } = await registerValidator()

      const ssvProxyContract = await ethers.getContractAt(
        "SSVProxy",
        ssvProxy
      )

      // Owner should be able to set fee recipient
      await expect(
        ssvProxyContract
          .connect(owner)
          .setFeeRecipientAddress(feeManagerInstance)
      ).to.not.be.reverted
    })

    it("should allow bulk exit validator via SSVProxy", async () => {
      const { ssvProxy, depositData, operatorIdsU64 } =
        await registerValidator()

      const ssvProxyContract = await ethers.getContractAt(
        "SSVProxy",
        ssvProxy
      )

      // Operator should be able to exit the validator
      await expect(
        ssvProxyContract
          .connect(operator)
          .bulkExitValidator([depositData.pubkey], operatorIdsU64)
      ).to.not.be.reverted
    })

    it("should remove validator from SSV Network via owner", async () => {
      const { ssvProxy, depositData, operatorIdsU64, cluster } =
        await registerValidator()

      const ssvProxyContract = await ethers.getContractAt(
        "SSVProxy",
        ssvProxy
      )

      // Owner calls removeValidator via callAnyContract (bypasses selector checks)
      const ssvNetworkIface = new ethers.Interface([
        "function removeValidator(bytes publicKey, uint64[] operatorIds, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
      ])
      const removeCalldata = ssvNetworkIface.encodeFunctionData(
        "removeValidator",
        [depositData.pubkey, operatorIdsU64, cluster]
      )

      const tx = await ssvProxyContract
        .connect(owner)
        .callAnyContract(HOODI_SSV_NETWORK, removeCalldata)
      const receipt = await tx.wait()

      // Verify ValidatorRemoved event
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ValidatorRemoved(address indexed owner, uint64[] operatorIds, bytes publicKey, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
        ],
        ethers.provider
      )

      const removeEvent = receipt!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === "ValidatorRemoved")

      expect(removeEvent).to.not.be.null
      expect(removeEvent!.args.owner).to.equal(ssvProxy)

      // Cluster validatorCount should be 0
      const clusterAfterRemove = toClusterObject(removeEvent!.args.cluster)
      expect(clusterAfterRemove.validatorCount).to.equal(0)

      // Validator should no longer be active
      const ssvViews = new ethers.Contract(
        HOODI_SSV_VIEWS,
        [
          "function getValidator(address owner, bytes calldata publicKey) external view returns (bool)",
        ],
        ethers.provider
      )
      const isActive = await ssvViews.getValidator(
        ssvProxy,
        depositData.pubkey
      )
      expect(isActive).to.be.false
    })

    it("should withdraw ETH from SSV cluster via SSVProxy", async () => {
      const { ssvProxy, operatorIdsU64, cluster } = await registerValidator()

      const ssvProxyContract = await ethers.getContractAt(
        "SSVProxy",
        ssvProxy
      )

      // Withdraw a small amount from the cluster
      const withdrawAmount = ethers.parseEther("0.01")
      const proxyBalanceBefore = await ethers.provider.getBalance(ssvProxy)

      await ssvProxyContract
        .connect(operator)
        .withdrawFromSSV(withdrawAmount, operatorIdsU64, [cluster])

      // SSVProxy should have received the withdrawn ETH
      const proxyBalanceAfter = await ethers.provider.getBalance(ssvProxy)
      expect(proxyBalanceAfter - proxyBalanceBefore).to.equal(withdrawAmount)
    })

    it("should allow client to call SSV Network via SSVProxy fallback with allowed selector", async () => {
      const { ssvProxy, depositData, operatorIdsU64 } =
        await registerValidator()

      // Get the exitValidator selector
      const ssvNetworkIface = new ethers.Interface([
        "function exitValidator(bytes publicKey, uint64[] operatorIds)",
      ])
      const exitSelector = ssvNetworkIface.getFunction("exitValidator")!
        .selector

      // Owner sets this selector as allowed for clients
      await ssvProxyFactory
        .connect(owner)
        .setAllowedSelectorsForClient([exitSelector])

      // Client should be able to call exitValidator via fallback
      const exitCalldata = ssvNetworkIface.encodeFunctionData(
        "exitValidator",
        [depositData.pubkey, operatorIdsU64]
      )

      const ssvProxyAsGeneric = new ethers.Contract(
        ssvProxy,
        [
          "function exitValidator(bytes publicKey, uint64[] operatorIds)",
        ],
        client
      )

      await expect(
        ssvProxyAsGeneric.exitValidator(depositData.pubkey, operatorIdsU64)
      ).to.not.be.reverted

      // Verify ValidatorExited event on SSV Network
      // (exitValidator just emits an event, doesn't change on-chain state)
    })
  })

  describe("callAnyContract on SSVProxy for SSV Network functions", () => {
    // Helper: register a validator and return context
    async function setupValidator() {
      const { withdrawalCreds, feeManagerInstance, ssvProxy } =
        await addEthFlow()

      const depositData = generateTestDepositData(client.address)
      const operatorIdsU64 = OPERATOR_IDS.map((id) => BigInt(id))
      const ssvClusterFunding = ethers.parseEther("0.5")

      const tx = await ssvProxyFactory
        .connect(operator)
        .makeBeaconDepositsAndRegisterValidators(
          withdrawalCreds,
          ETH_PER_VALIDATOR,
          feeManagerInstance,
          client.address,
          {
            signatures: [depositData.signature],
            depositDataRoots: [depositData.depositDataRoot],
          },
          operatorIdsU64,
          [depositData.pubkey],
          [MOCK_SHARES],
          EMPTY_CLUSTER,
          { value: ssvClusterFunding }
        )
      const receipt = await tx.wait()

      // Extract cluster from ValidatorAdded event
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ValidatorAdded(address indexed owner, uint64[] operatorIds, bytes publicKey, bytes shares, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
        ],
        ethers.provider
      )

      const validatorEvent = receipt!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === "ValidatorAdded")

      return {
        ssvProxy,
        feeManagerInstance,
        depositData,
        operatorIdsU64,
        cluster: toClusterObject(validatorEvent!.args.cluster),
      }
    }

    it("should deposit ETH to SSV cluster via callAnyContract (payable)", async () => {
      const { ssvProxy, operatorIdsU64, cluster } = await setupValidator()

      const ssvProxyContract = await ethers.getContractAt("SSVProxy", ssvProxy)

      // Encode deposit(address,uint64[],Cluster) call
      const ssvNetworkIface = new ethers.Interface([
        "function deposit(address owner, uint64[] operatorIds, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
      ])
      const depositCalldata = ssvNetworkIface.encodeFunctionData("deposit", [
        ssvProxy, // owner is the SSVProxy itself
        operatorIdsU64,
        cluster,
      ])

      const depositAmount = ethers.parseEther("0.1")

      // Owner calls callAnyContract with ETH value
      const tx = await ssvProxyContract
        .connect(owner)
        .callAnyContract(HOODI_SSV_NETWORK, depositCalldata, {
          value: depositAmount,
        })
      const receipt = await tx.wait()

      // Verify ClusterDeposited event on SSV Network
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ClusterDeposited(address indexed owner, uint64[] operatorIds, uint256 value, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
        ],
        ethers.provider
      )

      const depositEvent = receipt!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === "ClusterDeposited")

      expect(depositEvent).to.not.be.null
      expect(depositEvent!.args.owner).to.equal(ssvProxy)
      expect(depositEvent!.args.value).to.equal(depositAmount)
    })

    it("should withdraw from SSV cluster via callAnyContract", async () => {
      const { ssvProxy, operatorIdsU64, cluster } = await setupValidator()

      const ssvProxyContract = await ethers.getContractAt("SSVProxy", ssvProxy)

      // Encode withdraw(uint64[],uint256,Cluster) call
      const ssvNetworkIface = new ethers.Interface([
        "function withdraw(uint64[] operatorIds, uint256 tokenAmount, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
      ])
      const withdrawAmount = ethers.parseEther("0.01")
      const withdrawCalldata = ssvNetworkIface.encodeFunctionData("withdraw", [
        operatorIdsU64,
        withdrawAmount,
        cluster,
      ])

      const proxyBalanceBefore = await ethers.provider.getBalance(ssvProxy)

      const tx = await ssvProxyContract
        .connect(owner)
        .callAnyContract(HOODI_SSV_NETWORK, withdrawCalldata)
      const receipt = await tx.wait()

      // Verify ClusterWithdrawn event
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ClusterWithdrawn(address indexed owner, uint64[] operatorIds, uint256 value, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
        ],
        ethers.provider
      )

      const withdrawEvent = receipt!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === "ClusterWithdrawn")

      expect(withdrawEvent).to.not.be.null
      expect(withdrawEvent!.args.owner).to.equal(ssvProxy)
      expect(withdrawEvent!.args.value).to.equal(withdrawAmount)

      // SSVProxy should have received the withdrawn ETH
      const proxyBalanceAfter = await ethers.provider.getBalance(ssvProxy)
      expect(proxyBalanceAfter - proxyBalanceBefore).to.equal(withdrawAmount)
    })

    it("should remove validator via callAnyContract", async () => {
      const { ssvProxy, depositData, operatorIdsU64, cluster } =
        await setupValidator()

      const ssvProxyContract = await ethers.getContractAt("SSVProxy", ssvProxy)

      // Encode removeValidator(bytes,uint64[],Cluster) call
      const ssvNetworkIface = new ethers.Interface([
        "function removeValidator(bytes publicKey, uint64[] operatorIds, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
      ])
      const removeCalldata = ssvNetworkIface.encodeFunctionData(
        "removeValidator",
        [depositData.pubkey, operatorIdsU64, cluster]
      )

      const tx = await ssvProxyContract
        .connect(owner)
        .callAnyContract(HOODI_SSV_NETWORK, removeCalldata)
      const receipt = await tx.wait()

      // Verify ValidatorRemoved event on SSV Network
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ValidatorRemoved(address indexed owner, uint64[] operatorIds, bytes publicKey, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
        ],
        ethers.provider
      )

      const removeEvent = receipt!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === "ValidatorRemoved")

      expect(removeEvent).to.not.be.null
      expect(removeEvent!.args.owner).to.equal(ssvProxy)

      // Cluster validatorCount should be 0
      const clusterAfterRemove = toClusterObject(removeEvent!.args.cluster)
      expect(clusterAfterRemove.validatorCount).to.equal(0)

      // Validator should no longer be active
      const ssvViews = new ethers.Contract(
        HOODI_SSV_VIEWS,
        [
          "function getValidator(address owner, bytes calldata publicKey) external view returns (bool)",
        ],
        ethers.provider
      )
      expect(await ssvViews.getValidator(ssvProxy, depositData.pubkey)).to.be
        .false
    })

    it("should exit validator via callAnyContract", async () => {
      const { ssvProxy, depositData, operatorIdsU64 } = await setupValidator()

      const ssvProxyContract = await ethers.getContractAt("SSVProxy", ssvProxy)

      // Encode exitValidator(bytes,uint64[]) call
      const ssvNetworkIface = new ethers.Interface([
        "function exitValidator(bytes publicKey, uint64[] operatorIds)",
      ])
      const exitCalldata = ssvNetworkIface.encodeFunctionData("exitValidator", [
        depositData.pubkey,
        operatorIdsU64,
      ])

      const tx = await ssvProxyContract
        .connect(owner)
        .callAnyContract(HOODI_SSV_NETWORK, exitCalldata)
      const receipt = await tx.wait()

      // Verify ValidatorExited event on SSV Network
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ValidatorExited(address indexed owner, uint64[] operatorIds, bytes publicKey)",
        ],
        ethers.provider
      )

      const exitEvent = receipt!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === "ValidatorExited")

      expect(exitEvent).to.not.be.null
      expect(exitEvent!.args.owner).to.equal(ssvProxy)
    })

    it("should set fee recipient address via callAnyContract", async () => {
      const { ssvProxy, feeManagerInstance } = await setupValidator()

      const ssvProxyContract = await ethers.getContractAt("SSVProxy", ssvProxy)

      // Encode setFeeRecipientAddress(address) call
      const ssvNetworkIface = new ethers.Interface([
        "function setFeeRecipientAddress(address feeRecipientAddress)",
      ])
      const setFeeCalldata = ssvNetworkIface.encodeFunctionData(
        "setFeeRecipientAddress",
        [feeManagerInstance]
      )

      // Owner can call any SSV Network function via callAnyContract
      await expect(
        ssvProxyContract
          .connect(owner)
          .callAnyContract(HOODI_SSV_NETWORK, setFeeCalldata)
      ).to.not.be.reverted
    })

    it("should bulk exit validators via callAnyContract", async () => {
      // Register 2 validators for bulk exit
      const { withdrawalCreds, feeManagerInstance, ssvProxy } =
        await addEthFlow(ETH_PER_VALIDATOR * 2n)

      const depositData1 = generateTestDepositData(client.address)
      const depositData2 = generateTestDepositData(client.address)
      const operatorIdsU64 = OPERATOR_IDS.map((id) => BigInt(id))

      const regTx = await ssvProxyFactory
        .connect(operator)
        .makeBeaconDepositsAndRegisterValidators(
          withdrawalCreds,
          ETH_PER_VALIDATOR,
          feeManagerInstance,
          client.address,
          {
            signatures: [depositData1.signature, depositData2.signature],
            depositDataRoots: [
              depositData1.depositDataRoot,
              depositData2.depositDataRoot,
            ],
          },
          operatorIdsU64,
          [depositData1.pubkey, depositData2.pubkey],
          [MOCK_SHARES, MOCK_SHARES],
          EMPTY_CLUSTER,
          { value: ethers.parseEther("1") }
        )
      await regTx.wait()

      const ssvProxyContract = await ethers.getContractAt("SSVProxy", ssvProxy)

      // Encode bulkExitValidator(bytes[],uint64[]) call
      const ssvNetworkIface = new ethers.Interface([
        "function bulkExitValidator(bytes[] publicKeys, uint64[] operatorIds)",
      ])
      const bulkExitCalldata = ssvNetworkIface.encodeFunctionData(
        "bulkExitValidator",
        [[depositData1.pubkey, depositData2.pubkey], operatorIdsU64]
      )

      const tx = await ssvProxyContract
        .connect(owner)
        .callAnyContract(HOODI_SSV_NETWORK, bulkExitCalldata)
      const receipt = await tx.wait()

      // Verify ValidatorExited events for both validators
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ValidatorExited(address indexed owner, uint64[] operatorIds, bytes publicKey)",
        ],
        ethers.provider
      )

      const exitEvents = receipt!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .filter((e: any) => e?.name === "ValidatorExited")

      expect(exitEvents.length).to.equal(2)
      expect(exitEvents[0]!.args.owner).to.equal(ssvProxy)
      expect(exitEvents[1]!.args.owner).to.equal(ssvProxy)
    })

    it("should bulk remove validators via callAnyContract", async () => {
      // Register 2 validators
      const { withdrawalCreds, feeManagerInstance, ssvProxy } =
        await addEthFlow(ETH_PER_VALIDATOR * 2n)

      const depositData1 = generateTestDepositData(client.address)
      const depositData2 = generateTestDepositData(client.address)
      const operatorIdsU64 = OPERATOR_IDS.map((id) => BigInt(id))

      const regTx = await ssvProxyFactory
        .connect(operator)
        .makeBeaconDepositsAndRegisterValidators(
          withdrawalCreds,
          ETH_PER_VALIDATOR,
          feeManagerInstance,
          client.address,
          {
            signatures: [depositData1.signature, depositData2.signature],
            depositDataRoots: [
              depositData1.depositDataRoot,
              depositData2.depositDataRoot,
            ],
          },
          operatorIdsU64,
          [depositData1.pubkey, depositData2.pubkey],
          [MOCK_SHARES, MOCK_SHARES],
          EMPTY_CLUSTER,
          { value: ethers.parseEther("1") }
        )
      const regReceipt = await regTx.wait()

      // Extract final cluster state from the last ValidatorAdded event
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ValidatorAdded(address indexed owner, uint64[] operatorIds, bytes publicKey, bytes shares, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
          "event ValidatorRemoved(address indexed owner, uint64[] operatorIds, bytes publicKey, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
        ],
        ethers.provider
      )

      const addedEvents = regReceipt!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .filter((e: any) => e?.name === "ValidatorAdded")

      const clusterAfterReg = toClusterObject(
        addedEvents[addedEvents.length - 1]!.args.cluster
      )
      expect(clusterAfterReg.validatorCount).to.equal(2)

      // Bulk remove both validators via callAnyContract
      const ssvProxyContract = await ethers.getContractAt("SSVProxy", ssvProxy)

      const ssvNetworkIface = new ethers.Interface([
        "function bulkRemoveValidator(bytes[] publicKeys, uint64[] operatorIds, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
      ])
      const bulkRemoveCalldata = ssvNetworkIface.encodeFunctionData(
        "bulkRemoveValidator",
        [
          [depositData1.pubkey, depositData2.pubkey],
          operatorIdsU64,
          clusterAfterReg,
        ]
      )

      const tx = await ssvProxyContract
        .connect(owner)
        .callAnyContract(HOODI_SSV_NETWORK, bulkRemoveCalldata)
      const receipt = await tx.wait()

      // Verify ValidatorRemoved events for both validators
      const removeEvents = receipt!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .filter((e: any) => e?.name === "ValidatorRemoved")

      expect(removeEvents.length).to.equal(2)
      expect(removeEvents[0]!.args.owner).to.equal(ssvProxy)
      expect(removeEvents[1]!.args.owner).to.equal(ssvProxy)

      // Final cluster should have validatorCount = 0
      const clusterAfterRemove = toClusterObject(
        removeEvents[removeEvents.length - 1]!.args.cluster
      )
      expect(clusterAfterRemove.validatorCount).to.equal(0)

      // Verify both validators are no longer active
      const ssvViews = new ethers.Contract(
        HOODI_SSV_VIEWS,
        [
          "function getValidator(address owner, bytes calldata publicKey) external view returns (bool)",
        ],
        ethers.provider
      )
      expect(await ssvViews.getValidator(ssvProxy, depositData1.pubkey)).to.be
        .false
      expect(await ssvViews.getValidator(ssvProxy, depositData2.pubkey)).to.be
        .false
    })

    it("should revert callAnyContract when called by non-owner", async () => {
      const { ssvProxy, depositData, operatorIdsU64 } = await setupValidator()

      const ssvProxyContract = await ethers.getContractAt("SSVProxy", ssvProxy)

      const ssvNetworkIface = new ethers.Interface([
        "function exitValidator(bytes publicKey, uint64[] operatorIds)",
      ])
      const exitCalldata = ssvNetworkIface.encodeFunctionData("exitValidator", [
        depositData.pubkey,
        operatorIdsU64,
      ])

      // Operator (non-owner) should be rejected
      await expect(
        ssvProxyContract
          .connect(operator)
          .callAnyContract(HOODI_SSV_NETWORK, exitCalldata)
      ).to.be.reverted

      // Client (non-owner) should be rejected
      await expect(
        ssvProxyContract
          .connect(client)
          .callAnyContract(HOODI_SSV_NETWORK, exitCalldata)
      ).to.be.reverted
    })
  })

  describe("Fee distribution (EL rewards)", () => {
    it("should split EL rewards correctly between client, service, and referrer", async () => {
      // 1. Create a proxy (which also creates a FeeManager)
      const { feeManagerInstance } = await addEthFlow()

      // 2. Simulate EL rewards by sending ETH directly to the FeeManager
      const rewardAmount = ethers.parseEther("1")
      await owner.sendTransaction({
        to: feeManagerInstance,
        value: rewardAmount,
      })

      // Verify FeeManager received the ETH
      const fmBalance = await ethers.provider.getBalance(feeManagerInstance)
      expect(fmBalance).to.equal(rewardAmount)

      // 3. Record balances before withdrawal
      const clientBalanceBefore = await ethers.provider.getBalance(
        client.address
      )
      const serviceBalanceBefore = await ethers.provider.getBalance(
        service.address
      )
      const referrerBalanceBefore = await ethers.provider.getBalance(
        referrer.address
      )

      // 4. Call withdraw on the FeeManager instance (client or operator can call)
      const feeManagerContract = await ethers.getContractAt(
        "RewardFeeManager",
        feeManagerInstance
      )
      await feeManagerContract.connect(operator).withdraw()

      // 5. Verify splits
      // Client: 9000/10000 = 90%
      // Referrer: 500/10000 = 5%
      // Service: remainder = 5%
      const expectedClientAmount =
        (rewardAmount * BigInt(DEFAULT_CLIENT_BASIS_POINTS)) / 10000n
      const expectedReferrerAmount = (rewardAmount * 500n) / 10000n
      const expectedServiceAmount =
        rewardAmount - expectedClientAmount - expectedReferrerAmount

      const clientBalanceAfter = await ethers.provider.getBalance(
        client.address
      )
      const serviceBalanceAfter = await ethers.provider.getBalance(
        service.address
      )
      const referrerBalanceAfter = await ethers.provider.getBalance(
        referrer.address
      )

      expect(clientBalanceAfter - clientBalanceBefore).to.equal(
        expectedClientAmount
      )
      expect(serviceBalanceAfter - serviceBalanceBefore).to.equal(
        expectedServiceAmount
      )
      expect(referrerBalanceAfter - referrerBalanceBefore).to.equal(
        expectedReferrerAmount
      )
    })

    it("should split partial withdrawal correctly via withdrawAmount", async () => {
      const { feeManagerInstance } = await addEthFlow()

      // Send 2 ETH of rewards
      await owner.sendTransaction({
        to: feeManagerInstance,
        value: ethers.parseEther("2"),
      })

      // Withdraw only 1 ETH
      const withdrawAmount = ethers.parseEther("1")

      const clientBalanceBefore = await ethers.provider.getBalance(
        client.address
      )
      const serviceBalanceBefore = await ethers.provider.getBalance(
        service.address
      )

      const feeManagerContract = await ethers.getContractAt(
        "RewardFeeManager",
        feeManagerInstance
      )
      await feeManagerContract.connect(operator).withdrawAmount(withdrawAmount)

      // Verify partial split
      const expectedClientAmount =
        (withdrawAmount * BigInt(DEFAULT_CLIENT_BASIS_POINTS)) / 10000n
      const expectedReferrerAmount = (withdrawAmount * 500n) / 10000n
      const expectedServiceAmount =
        withdrawAmount - expectedClientAmount - expectedReferrerAmount

      const clientBalanceAfter = await ethers.provider.getBalance(
        client.address
      )
      const serviceBalanceAfter = await ethers.provider.getBalance(
        service.address
      )

      expect(clientBalanceAfter - clientBalanceBefore).to.equal(
        expectedClientAmount
      )
      expect(serviceBalanceAfter - serviceBalanceBefore).to.equal(
        expectedServiceAmount
      )

      // FeeManager should still hold 1 ETH
      const remainingBalance = await ethers.provider.getBalance(
        feeManagerInstance
      )
      expect(remainingBalance).to.equal(ethers.parseEther("1"))
    })
  })

  describe("Multiple clients with separate proxies", () => {
    it("should create isolated SSVProxy instances for different clients", async () => {
      const [, , , , , client2] = await ethers.getSigners()

      const withdrawalCreds1 = withdrawalCredentialsBytes32(client.address)
      const withdrawalCreds2 = withdrawalCredentialsBytes32(client2.address)

      const clientConfig1 = {
        recipient: client.address,
        basisPoints: DEFAULT_CLIENT_BASIS_POINTS,
      }
      const clientConfig2 = {
        recipient: client2.address,
        basisPoints: DEFAULT_CLIENT_BASIS_POINTS,
      }
      const referrerConfig = {
        recipient: referrer.address,
        basisPoints: 500n,
      }

      // Client 1 deposits
      const tx1 = await ssvProxyFactory.connect(client).addEth(
        withdrawalCreds1,
        ETH_PER_VALIDATOR,
        clientConfig1,
        referrerConfig,
        "0x",
        { value: ETH_PER_VALIDATOR }
      )
      const receipt1 = await tx1.wait()

      // Client 2 deposits
      const tx2 = await ssvProxyFactory.connect(client2).addEth(
        withdrawalCreds2,
        ETH_PER_VALIDATOR,
        clientConfig2,
        referrerConfig,
        "0x",
        { value: ETH_PER_VALIDATOR }
      )
      const receipt2 = await tx2.wait()

      // Parse events
      const iface = ssvProxyFactory.interface
      const parseDepositEvent = (receipt: any) =>
        receipt.logs
          .map((log: any) => {
            try {
              return iface.parseLog({ topics: log.topics, data: log.data })
            } catch {
              return null
            }
          })
          .find((e: any) => e?.name === "EthForSsvStakingDeposited")

      const event1 = parseDepositEvent(receipt1)
      const event2 = parseDepositEvent(receipt2)

      const ssvProxy1 = event1!.args._ssvProxy
      const ssvProxy2 = event2!.args._ssvProxy
      const feeManager1 = event1!.args._feeManagerInstance
      const feeManager2 = event2!.args._feeManagerInstance

      // Different clients should have different SSVProxy instances
      expect(ssvProxy1).to.not.equal(ssvProxy2)

      // Different clients should have different FeeManager instances
      expect(feeManager1).to.not.equal(feeManager2)

      // Verify each client's proxy list
      const client1Proxies = await ssvProxyFactory.getAllClientSsvProxies(
        client.address
      )
      const client2Proxies = await ssvProxyFactory.getAllClientSsvProxies(
        client2.address
      )

      expect(client1Proxies.length).to.equal(1)
      expect(client2Proxies.length).to.equal(1)
      expect(client1Proxies[0]).to.equal(ssvProxy1)
      expect(client2Proxies[0]).to.equal(ssvProxy2)
    })
  })

  describe("Cluster liquidation check", () => {
    it("should show cluster is not liquidatable after well-funded registration", async () => {
      // Register a validator with adequate funding
      const { withdrawalCreds, feeManagerInstance, ssvProxy } =
        await addEthFlow()

      const depositData = generateTestDepositData(client.address)
      const operatorIdsU64 = OPERATOR_IDS.map((id) => BigInt(id))
      const ssvClusterFunding = ethers.parseEther("0.5")

      const tx = await ssvProxyFactory
        .connect(operator)
        .makeBeaconDepositsAndRegisterValidators(
          withdrawalCreds,
          ETH_PER_VALIDATOR,
          feeManagerInstance,
          client.address,
          {
            signatures: [depositData.signature],
            depositDataRoots: [depositData.depositDataRoot],
          },
          operatorIdsU64,
          [depositData.pubkey],
          [MOCK_SHARES],
          EMPTY_CLUSTER,
          { value: ssvClusterFunding }
        )
      const receipt = await tx.wait()

      // Extract cluster from ValidatorAdded event
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ValidatorAdded(address indexed owner, uint64[] operatorIds, bytes publicKey, bytes shares, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
        ],
        ethers.provider
      )

      const validatorEvent = receipt!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === "ValidatorAdded")

      const cluster = toClusterObject(validatorEvent!.args.cluster)

      // Check via SSV Views that the cluster is NOT liquidatable
      const ssvViews = new ethers.Contract(
        HOODI_SSV_VIEWS,
        [
          "function isLiquidatable(address owner, uint64[] memory operatorIds, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) memory cluster) external view returns (bool)",
        ],
        ethers.provider
      )

      const isLiquidatable = await ssvViews.isLiquidatable(
        ssvProxy,
        operatorIdsU64,
        cluster
      )
      expect(isLiquidatable).to.be.false
    })
  })

  describe("Refund after expiration", () => {
    it("should allow client to refund ETH after 24-hour timeout", async () => {
      // 1. addEth to deposit 32 ETH
      const { withdrawalCreds, feeManagerInstance } = await addEthFlow()

      // 2. Verify deposit exists in gateway
      const depositId = await gatewayEth2Deposit.getDepositId(
        withdrawalCreds,
        ETH_PER_VALIDATOR,
        feeManagerInstance,
        client.address // _operatorAddress = msg.sender from addEth = client
      )

      const depositAmount = await gatewayEth2Deposit.depositAmount(depositId)
      expect(depositAmount).to.equal(ETH_PER_VALIDATOR)

      // 3. Advance time by 1 day + 1 second to pass TIMEOUT
      await time.increase(86400 + 1) // 1 day = 86400 seconds

      // 4. Record client balance before refund
      const clientBalanceBefore = await ethers.provider.getBalance(
        client.address
      )

      // 5. Client calls refund
      const refundTx = await gatewayEth2Deposit.connect(client).refund(
        withdrawalCreds,
        ETH_PER_VALIDATOR,
        feeManagerInstance,
        client.address // _operatorAddress
      )
      const refundReceipt = await refundTx.wait()
      const gasUsed =
        refundReceipt!.gasUsed * refundReceipt!.gasPrice

      // 6. Verify client received the refund (minus gas)
      const clientBalanceAfter = await ethers.provider.getBalance(
        client.address
      )
      expect(clientBalanceAfter - clientBalanceBefore + gasUsed).to.equal(
        ETH_PER_VALIDATOR
      )

      // 7. Verify deposit is cleared
      const depositAmountAfter =
        await gatewayEth2Deposit.depositAmount(depositId)
      expect(depositAmountAfter).to.equal(0)
    })

    it("should revert refund before timeout expires", async () => {
      const { withdrawalCreds, feeManagerInstance } = await addEthFlow()

      // Try to refund immediately (before timeout)
      await expect(
        gatewayEth2Deposit.connect(client).refund(
          withdrawalCreds,
          ETH_PER_VALIDATOR,
          feeManagerInstance,
          client.address
        )
      ).to.be.reverted
    })
  })

  describe("SSVProxy.withdrawETH", () => {
    it("should allow operator to withdraw accumulated ETH from SSVProxy", async () => {
      // 1. Register a validator (SSVProxy gets created)
      const { withdrawalCreds, feeManagerInstance, ssvProxy } =
        await addEthFlow()

      const depositData = generateTestDepositData(client.address)
      const operatorIdsU64 = OPERATOR_IDS.map((id) => BigInt(id))

      const tx = await ssvProxyFactory
        .connect(operator)
        .makeBeaconDepositsAndRegisterValidators(
          withdrawalCreds,
          ETH_PER_VALIDATOR,
          feeManagerInstance,
          client.address,
          {
            signatures: [depositData.signature],
            depositDataRoots: [depositData.depositDataRoot],
          },
          operatorIdsU64,
          [depositData.pubkey],
          [MOCK_SHARES],
          EMPTY_CLUSTER,
          { value: ethers.parseEther("0.5") }
        )
      const receipt = await tx.wait()

      // Extract cluster from ValidatorAdded event
      const ssvNetworkContract = new ethers.Contract(
        HOODI_SSV_NETWORK,
        [
          "event ValidatorAdded(address indexed owner, uint64[] operatorIds, bytes publicKey, bytes shares, tuple(uint32 validatorCount, uint64 networkFeeIndex, uint64 index, bool active, uint256 balance) cluster)",
        ],
        ethers.provider
      )

      const validatorEvent = receipt!.logs
        .filter(
          (log: any) =>
            log.address.toLowerCase() === HOODI_SSV_NETWORK.toLowerCase()
        )
        .map((log: any) => {
          try {
            return ssvNetworkContract.interface.parseLog({
              topics: log.topics,
              data: log.data,
            })
          } catch {
            return null
          }
        })
        .find((e: any) => e?.name === "ValidatorAdded")

      const cluster = toClusterObject(validatorEvent!.args.cluster)

      // 2. Withdraw from SSV cluster so SSVProxy holds ETH
      const ssvProxyContract = await ethers.getContractAt("SSVProxy", ssvProxy)
      const withdrawFromCluster = ethers.parseEther("0.05")
      await ssvProxyContract
        .connect(operator)
        .withdrawFromSSV(withdrawFromCluster, operatorIdsU64, [cluster])

      const proxyBalance = await ethers.provider.getBalance(ssvProxy)
      expect(proxyBalance).to.equal(withdrawFromCluster)

      // 3. Use withdrawETH to send ETH from SSVProxy to a recipient
      const recipient = service.address
      const recipientBalanceBefore = await ethers.provider.getBalance(recipient)

      await ssvProxyContract
        .connect(operator)
        .withdrawETH(recipient, withdrawFromCluster)

      const recipientBalanceAfter = await ethers.provider.getBalance(recipient)
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(
        withdrawFromCluster
      )

      // SSVProxy balance should be 0
      const proxyBalanceAfter = await ethers.provider.getBalance(ssvProxy)
      expect(proxyBalanceAfter).to.equal(0n)
    })

    it("should revert withdrawETH when called by non-authorized user", async () => {
      const { ssvProxy } = await addEthFlow()

      const ssvProxyContract = await ethers.getContractAt("SSVProxy", ssvProxy)

      // Send some ETH to SSVProxy directly
      await owner.sendTransaction({
        to: ssvProxy,
        value: ethers.parseEther("0.01"),
      })

      // Client should not be able to withdraw
      await expect(
        ssvProxyContract
          .connect(client)
          .withdrawETH(client.address, ethers.parseEther("0.01"))
      ).to.be.reverted
    })
  })

  describe("Service rejection and immediate refund", () => {
    it("should allow operator to reject service and client to refund immediately", async () => {
      // 1. Client deposits ETH
      const { withdrawalCreds, feeManagerInstance } = await addEthFlow()

      const depositId = await gatewayEth2Deposit.getDepositId(
        withdrawalCreds,
        ETH_PER_VALIDATOR,
        feeManagerInstance,
        client.address
      )

      // Verify deposit exists
      const depositAmount = await gatewayEth2Deposit.depositAmount(depositId)
      expect(depositAmount).to.equal(ETH_PER_VALIDATOR)

      // 2. Owner rejects the service (rejectService checks feeManagerFactory's operator/owner)
      await gatewayEth2Deposit
        .connect(owner)
        .rejectService(depositId, "KYC failed")

      // Verify status is ServiceRejected
      const status = await gatewayEth2Deposit.depositStatus(depositId)
      expect(status).to.equal(3) // ClientDepositStatus.ServiceRejected = 3

      // 3. Client can refund immediately (no 24h wait needed)
      const clientBalanceBefore = await ethers.provider.getBalance(
        client.address
      )

      const refundTx = await gatewayEth2Deposit.connect(client).refund(
        withdrawalCreds,
        ETH_PER_VALIDATOR,
        feeManagerInstance,
        client.address
      )
      const refundReceipt = await refundTx.wait()
      const gasUsed = refundReceipt!.gasUsed * refundReceipt!.gasPrice

      // 4. Verify client received their ETH back
      const clientBalanceAfter = await ethers.provider.getBalance(
        client.address
      )
      expect(clientBalanceAfter - clientBalanceBefore + gasUsed).to.equal(
        ETH_PER_VALIDATOR
      )

      // 5. Deposit should be cleared
      const depositAmountAfter =
        await gatewayEth2Deposit.depositAmount(depositId)
      expect(depositAmountAfter).to.equal(0)
    })

    it("should prevent new deposits after service rejection", async () => {
      // 1. Client deposits, operator rejects
      const { withdrawalCreds, feeManagerInstance } = await addEthFlow()

      const depositId = await gatewayEth2Deposit.getDepositId(
        withdrawalCreds,
        ETH_PER_VALIDATOR,
        feeManagerInstance,
        client.address
      )

      await gatewayEth2Deposit
        .connect(owner)
        .rejectService(depositId, "Compliance issue")

      // 2. Client tries to deposit again with same params - should revert
      const clientConfig = {
        recipient: client.address,
        basisPoints: DEFAULT_CLIENT_BASIS_POINTS,
      }
      const referrerConfig = {
        recipient: referrer.address,
        basisPoints: 500n,
      }

      await expect(
        ssvProxyFactory.connect(client).addEth(
          withdrawalCreds,
          ETH_PER_VALIDATOR,
          clientConfig,
          referrerConfig,
          "0x",
          { value: ETH_PER_VALIDATOR }
        )
      ).to.be.reverted
    })
  })
})
