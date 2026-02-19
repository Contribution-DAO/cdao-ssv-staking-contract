import { expect } from "chai"
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { ethers } from "hardhat"
import {
  SSVProxy,
  SSVProxyFactory,
  FeeManagerFactory,
  MockSSVNetwork,
} from "../typechain-types"
import { deployContractsFixture } from "./fixtures/deployContracts"
import { defaultClientBasisPoints } from "./constants"

describe("SSVProxy", () => {
  let ssvProxy: SSVProxy
  let ssvProxyFactory: SSVProxyFactory
  let feeManagerFactory: FeeManagerFactory
  let mockSSVNetwork: MockSSVNetwork
  let owner: any
  let client: any
  let referrer: any
  let operator: any
  let otherAccount: any

  beforeEach(async () => {
    const fixture = await loadFixture(deployContractsFixture)
    ssvProxy = fixture.ssvProxy
    ssvProxyFactory = fixture.ssvProxyFactory
    feeManagerFactory = fixture.feeManagerFactory
    mockSSVNetwork = fixture.mockSSVNetwork
    owner = fixture.owner
    client = fixture.client
    referrer = fixture.referrer
    operator = fixture.operator
    otherAccount = fixture.otherAccount
  })

  // Helper: create a clone SSVProxy via SSVProxyFactory
  async function createCloneProxy(): Promise<SSVProxy> {
    const clientConfig = {
      recipient: client.address,
      basisPoints: defaultClientBasisPoints,
    }
    const referrerConfig = {
      recipient: referrer.address,
      basisPoints: 500n,
    }

    // Create fee manager
    const tx = await feeManagerFactory
      .connect(owner)
      .createFeeManager(
        await ssvProxyFactory.getReferenceFeeManager(),
        clientConfig,
        referrerConfig
      )
    const receipt = await tx.wait()
    const event: any = receipt?.logs[0]
    const feeManagerAddress = event?.address

    // Create SSV proxy clone
    await ssvProxyFactory.connect(operator).createSSVProxy(feeManagerAddress)

    const clientProxies = await ssvProxyFactory.getAllClientSsvProxies(
      client.address
    )
    const cloneAddress = clientProxies[clientProxies.length - 1]
    return ethers.getContractAt("SSVProxy", cloneAddress) as Promise<SSVProxy>
  }

  describe("Initialization", () => {
    it("should have the correct factory address", async () => {
      expect(await ssvProxy.getFactory()).to.equal(
        await ssvProxyFactory.getAddress()
      )
    })

    it("should have the correct owner", async () => {
      expect(await ssvProxy.owner()).to.equal(owner.address)
    })

    it("should have the correct operator", async () => {
      expect(await ssvProxy.operator()).to.equal(operator.address)
    })
  })

  describe("ETH Handling", () => {
    it("should accept ETH via receive", async () => {
      const ssvProxyAddr = await ssvProxy.getAddress()
      await owner.sendTransaction({
        to: ssvProxyAddr,
        value: 1000n,
      })
      const balance = await owner.provider.getBalance(ssvProxyAddr)
      expect(balance).to.equal(1000n)
    })

    it("should allow operator to withdraw ETH", async () => {
      const ssvProxyAddr = await ssvProxy.getAddress()
      await owner.sendTransaction({
        to: ssvProxyAddr,
        value: 1000n,
      })

      const balanceBefore = await owner.provider.getBalance(owner.address)
      await ssvProxy.connect(operator).withdrawETH(owner.address, 1000n)
      const balanceAfter = await owner.provider.getBalance(owner.address)
      expect(balanceAfter - balanceBefore).to.equal(1000n)
    })

    it("should allow owner to withdraw ETH", async () => {
      const ssvProxyAddr = await ssvProxy.getAddress()
      await owner.sendTransaction({
        to: ssvProxyAddr,
        value: 1000n,
      })

      const balanceBefore = await owner.provider.getBalance(otherAccount.address)
      await ssvProxy.connect(owner).withdrawETH(otherAccount.address, 1000n)
      const balanceAfter = await owner.provider.getBalance(otherAccount.address)
      expect(balanceAfter - balanceBefore).to.equal(1000n)
    })

    it("should revert when non-operator/owner tries to withdraw ETH", async () => {
      await expect(
        ssvProxy.connect(otherAccount).withdrawETH(otherAccount.address, 0)
      ).to.be.revertedWithCustomError(
        ssvProxy,
        "CallerNeitherOperatorNorOwner"
      )
    })

    it("should revert when withdrawing more ETH than balance", async () => {
      const ssvProxyAddr = await ssvProxy.getAddress()
      await owner.sendTransaction({
        to: ssvProxyAddr,
        value: 100n,
      })

      await expect(
        ssvProxy.connect(operator).withdrawETH(owner.address, 200n)
      ).to.be.revertedWithCustomError(ssvProxy, "EthTransferFailed")
    })
  })

  describe("Access Control", () => {
    describe("callAnyContract", () => {
      it("should only allow owner to call callAnyContract", async () => {
        await expect(
          ssvProxy
            .connect(otherAccount)
            .callAnyContract(otherAccount.address, "0x12345678")
        ).to.be.revertedWithCustomError(ssvProxy, "CallerNotOwner")
      })

      it("should not allow operator to call callAnyContract", async () => {
        await expect(
          ssvProxy
            .connect(operator)
            .callAnyContract(otherAccount.address, "0x12345678")
        ).to.be.revertedWithCustomError(ssvProxy, "CallerNotOwner")
      })

      it("should forward ETH when calling payable functions", async () => {
        const mockAddr = await mockSSVNetwork.getAddress()
        // Call setFeeRecipientAddress on mock (non-payable function) via callAnyContract
        const iface = new ethers.Interface([
          "function setFeeRecipientAddress(address)",
        ])
        const calldata = iface.encodeFunctionData("setFeeRecipientAddress", [
          owner.address,
        ])

        await ssvProxy.connect(owner).callAnyContract(mockAddr, calldata)
        expect(await mockSSVNetwork.lastFeeRecipient()).to.equal(owner.address)
      })

      it("should forward ETH value via callAnyContract", async () => {
        const mockAddr = await mockSSVNetwork.getAddress()
        const ethAmount = ethers.parseEther("0.1")

        // Encode a payable function call on MockSSVNetwork
        const iface = new ethers.Interface([
          "function migrateClusterToETH(uint64[],tuple(uint32 validatorCount,uint64 networkFeeIndex,uint64 index,bool active,uint256 balance))",
        ])
        const cluster = {
          validatorCount: 0,
          networkFeeIndex: 0,
          index: 0,
          active: true,
          balance: 0,
        }
        const calldata = iface.encodeFunctionData("migrateClusterToETH", [
          [1n, 2n, 3n, 4n],
          cluster,
        ])

        await ssvProxy
          .connect(owner)
          .callAnyContract(mockAddr, calldata, { value: ethAmount })

        expect(await mockSSVNetwork.migrateClusterToETHCallCount()).to.equal(1)
        expect(await mockSSVNetwork.totalEthReceived()).to.equal(ethAmount)
      })
    })

    describe("initialize", () => {
      it("should revert when non-factory tries to call initialize", async () => {
        await expect(
          ssvProxy.connect(owner).initialize(otherAccount.address)
        ).to.be.revertedWithCustomError(ssvProxy, "NotSSVProxyFactoryCalled")
      })
    })
  })

  describe("migrateClusterToETH", () => {
    it("should allow operator to call migrateClusterToETH", async () => {
      const cloneProxy = await createCloneProxy()
      const ethAmount = ethers.parseEther("0.5")
      const cluster = {
        validatorCount: 1,
        networkFeeIndex: 0,
        index: 0,
        active: true,
        balance: 0,
      }

      await cloneProxy
        .connect(operator)
        .migrateClusterToETH([1n, 2n, 3n, 4n], cluster, { value: ethAmount })

      expect(await mockSSVNetwork.migrateClusterToETHCallCount()).to.equal(1)
      expect(await mockSSVNetwork.totalEthReceived()).to.equal(ethAmount)
    })

    it("should allow owner to call migrateClusterToETH", async () => {
      const cloneProxy = await createCloneProxy()
      const ethAmount = ethers.parseEther("0.5")
      const cluster = {
        validatorCount: 1,
        networkFeeIndex: 0,
        index: 0,
        active: true,
        balance: 0,
      }

      await cloneProxy
        .connect(owner)
        .migrateClusterToETH([1n, 2n, 3n, 4n], cluster, { value: ethAmount })

      expect(await mockSSVNetwork.migrateClusterToETHCallCount()).to.equal(1)
    })

    it("should revert when non-authorized tries to call migrateClusterToETH", async () => {
      const cloneProxy = await createCloneProxy()
      const cluster = {
        validatorCount: 1,
        networkFeeIndex: 0,
        index: 0,
        active: true,
        balance: 0,
      }

      await expect(
        cloneProxy
          .connect(otherAccount)
          .migrateClusterToETH([1n, 2n, 3n, 4n], cluster, { value: 0 })
      ).to.be.revertedWithCustomError(
        cloneProxy,
        "CallerNeitherOperatorNorOwner"
      )
    })
  })

  describe("depositToSSV", () => {
    it("should split ETH evenly across clusters", async () => {
      const cloneProxy = await createCloneProxy()
      const ethAmount = ethers.parseEther("1")
      const cluster = {
        validatorCount: 1,
        networkFeeIndex: 0,
        index: 0,
        active: true,
        balance: 0,
      }

      await cloneProxy
        .connect(operator)
        .depositToSSV([1n, 2n, 3n, 4n], [cluster, cluster], {
          value: ethAmount,
        })

      // Should have called deposit twice (once per cluster)
      expect(await mockSSVNetwork.depositCallCount()).to.equal(2)
      expect(await mockSSVNetwork.totalEthReceived()).to.equal(ethAmount)
    })

    it("should give remainder to last validator", async () => {
      const cloneProxy = await createCloneProxy()
      // 1 ether = 1000000000000000000 wei, divided by 3 = 333333333333333333 each
      // remainder = 1 wei goes to last
      const ethAmount = ethers.parseEther("1")
      const cluster = {
        validatorCount: 1,
        networkFeeIndex: 0,
        index: 0,
        active: true,
        balance: 0,
      }

      await cloneProxy
        .connect(operator)
        .depositToSSV([1n, 2n, 3n, 4n], [cluster, cluster, cluster], {
          value: ethAmount,
        })

      expect(await mockSSVNetwork.depositCallCount()).to.equal(3)
      // Last deposit gets the remainder
      const perValidator = ethAmount / 3n
      const lastDeposit = ethAmount - perValidator * 2n
      expect(await mockSSVNetwork.lastDepositEthAmount()).to.equal(lastDeposit)
      expect(lastDeposit).to.be.greaterThanOrEqual(perValidator)
    })

    it("should work with single cluster", async () => {
      const cloneProxy = await createCloneProxy()
      const ethAmount = ethers.parseEther("0.5")
      const cluster = {
        validatorCount: 1,
        networkFeeIndex: 0,
        index: 0,
        active: true,
        balance: 0,
      }

      await cloneProxy
        .connect(operator)
        .depositToSSV([1n, 2n, 3n, 4n], [cluster], { value: ethAmount })

      expect(await mockSSVNetwork.depositCallCount()).to.equal(1)
      expect(await mockSSVNetwork.lastDepositEthAmount()).to.equal(ethAmount)
    })
  })

  describe("bulkRegisterValidators", () => {
    it("should revert when non-factory tries to call", async () => {
      const cloneProxy = await createCloneProxy()
      const cluster = {
        validatorCount: 0,
        networkFeeIndex: 0,
        index: 0,
        active: true,
        balance: 0,
      }

      await expect(
        cloneProxy
          .connect(operator)
          .bulkRegisterValidators(
            ["0x1234"],
            [1n, 2n, 3n, 4n],
            ["0x5678"],
            cluster,
            { value: ethers.parseEther("0.1") }
          )
      ).to.be.revertedWithCustomError(cloneProxy, "NotSSVProxyFactoryCalled")
    })

    it("should revert when owner tries to call directly", async () => {
      const cloneProxy = await createCloneProxy()
      const cluster = {
        validatorCount: 0,
        networkFeeIndex: 0,
        index: 0,
        active: true,
        balance: 0,
      }

      await expect(
        cloneProxy
          .connect(owner)
          .bulkRegisterValidators(
            ["0x1234"],
            [1n, 2n, 3n, 4n],
            ["0x5678"],
            cluster,
            { value: ethers.parseEther("0.1") }
          )
      ).to.be.revertedWithCustomError(cloneProxy, "NotSSVProxyFactoryCalled")
    })
  })

  describe("fallback", () => {
    it("should allow owner to call SSVNetwork via fallback", async () => {
      const cloneProxy = await createCloneProxy()
      const cloneAddr = await cloneProxy.getAddress()

      // Call setFeeRecipientAddress via fallback (owner can call any selector)
      const iface = new ethers.Interface([
        "function setFeeRecipientAddress(address)",
      ])
      const calldata = iface.encodeFunctionData("setFeeRecipientAddress", [
        owner.address,
      ])

      await owner.sendTransaction({ to: cloneAddr, data: calldata })
      expect(await mockSSVNetwork.setFeeRecipientCallCount()).to.equal(1)
    })

    it("should allow operator to call allowed selector via fallback", async () => {
      const cloneProxy = await createCloneProxy()
      const cloneAddr = await cloneProxy.getAddress()

      // Use exitValidator - exists on SSVNetwork but NOT as a named function on SSVProxy
      const iface = new ethers.Interface([
        "function exitValidator(bytes,uint64[])",
      ])
      const selector = iface.getFunction("exitValidator")!.selector
      await ssvProxyFactory
        .connect(owner)
        .setAllowedSelectorsForOperator([selector])

      const calldata = iface.encodeFunctionData("exitValidator", [
        "0x" + "aa".repeat(48),
        [1n, 2n, 3n, 4n],
      ])

      await operator.sendTransaction({ to: cloneAddr, data: calldata })
      // Verify the call went through to MockSSVNetwork via fallback
    })

    it("should revert when operator calls non-allowed selector via fallback", async () => {
      const cloneProxy = await createCloneProxy()
      const cloneAddr = await cloneProxy.getAddress()

      // Use exitValidator - exists on SSVNetwork but NOT as a named function on SSVProxy
      const iface = new ethers.Interface([
        "function exitValidator(bytes,uint64[])",
      ])
      const calldata = iface.encodeFunctionData("exitValidator", [
        "0x" + "aa".repeat(48),
        [1n, 2n, 3n, 4n],
      ])

      // Operator calling without selector being allowed should revert
      await expect(
        operator.sendTransaction({ to: cloneAddr, data: calldata })
      ).to.be.reverted
    })

    it("should forward ETH value via fallback", async () => {
      const cloneProxy = await createCloneProxy()
      const cloneAddr = await cloneProxy.getAddress()
      const ethAmount = ethers.parseEther("0.1")

      // Owner can call any function via fallback with ETH
      const iface = new ethers.Interface([
        "function migrateClusterToETH(uint64[],tuple(uint32 validatorCount,uint64 networkFeeIndex,uint64 index,bool active,uint256 balance))",
      ])
      const cluster = {
        validatorCount: 0,
        networkFeeIndex: 0,
        index: 0,
        active: true,
        balance: 0,
      }
      const calldata = iface.encodeFunctionData("migrateClusterToETH", [
        [1n, 2n, 3n, 4n],
        cluster,
      ])

      await owner.sendTransaction({
        to: cloneAddr,
        data: calldata,
        value: ethAmount,
      })

      expect(await mockSSVNetwork.migrateClusterToETHCallCount()).to.equal(1)
      expect(await mockSSVNetwork.totalEthReceived()).to.equal(ethAmount)
    })

    it("should allow client to call allowed selector via fallback", async () => {
      const cloneProxy = await createCloneProxy()
      const cloneAddr = await cloneProxy.getAddress()

      // Use exitValidator - exists on SSVNetwork but NOT as a named function on SSVProxy
      const iface = new ethers.Interface([
        "function exitValidator(bytes,uint64[])",
      ])
      const selector = iface.getFunction("exitValidator")!.selector
      await ssvProxyFactory
        .connect(owner)
        .setAllowedSelectorsForClient([selector])

      const calldata = iface.encodeFunctionData("exitValidator", [
        "0x" + "aa".repeat(48),
        [1n, 2n, 3n, 4n],
      ])

      await client.sendTransaction({ to: cloneAddr, data: calldata })
      // Verify the call went through to MockSSVNetwork via fallback
    })
  })

  describe("setFeeRecipientAddress", () => {
    it("should allow operator to set fee recipient", async () => {
      const cloneProxy = await createCloneProxy()
      await cloneProxy
        .connect(operator)
        .setFeeRecipientAddress(referrer.address)
      expect(await mockSSVNetwork.lastFeeRecipient()).to.equal(referrer.address)
    })

    it("should allow owner to set fee recipient", async () => {
      const cloneProxy = await createCloneProxy()
      await cloneProxy.connect(owner).setFeeRecipientAddress(referrer.address)
      expect(await mockSSVNetwork.lastFeeRecipient()).to.equal(referrer.address)
    })

    it("should revert when non-authorized tries to set fee recipient", async () => {
      const cloneProxy = await createCloneProxy()
      await expect(
        cloneProxy.connect(otherAccount).setFeeRecipientAddress(referrer.address)
      ).to.be.revertedWithCustomError(
        cloneProxy,
        "CallerNeitherOperatorNorOwner"
      )
    })
  })

  describe("bulkExitValidator", () => {
    it("should allow operator to bulk exit validators", async () => {
      const cloneProxy = await createCloneProxy()
      await cloneProxy
        .connect(operator)
        .bulkExitValidator(["0x1234", "0x5678"], [1n, 2n, 3n, 4n])
      expect(await mockSSVNetwork.bulkExitValidatorCallCount()).to.equal(1)
    })

    it("should allow client to bulk exit validators", async () => {
      const cloneProxy = await createCloneProxy()
      await cloneProxy
        .connect(client)
        .bulkExitValidator(["0x1234"], [1n, 2n, 3n, 4n])
      expect(await mockSSVNetwork.bulkExitValidatorCallCount()).to.equal(1)
    })

    it("should revert when non-authorized tries to bulk exit", async () => {
      const cloneProxy = await createCloneProxy()
      await expect(
        cloneProxy
          .connect(otherAccount)
          .bulkExitValidator(["0x1234"], [1n, 2n, 3n, 4n])
      ).to.be.revertedWithCustomError(
        cloneProxy,
        "CallerNeitherOperatorNorOwnerNorClient"
      )
    })
  })

  describe("withdrawFromSSV", () => {
    it("should allow operator to withdraw from SSV", async () => {
      const cloneProxy = await createCloneProxy()
      const cluster = {
        validatorCount: 1,
        networkFeeIndex: 0,
        index: 0,
        active: true,
        balance: 1000n,
      }

      await cloneProxy
        .connect(operator)
        .withdrawFromSSV(100n, [1n, 2n, 3n, 4n], [cluster])
      expect(await mockSSVNetwork.withdrawCallCount()).to.equal(1)
    })

    it("should revert when non-authorized tries to withdraw", async () => {
      const cloneProxy = await createCloneProxy()
      const cluster = {
        validatorCount: 1,
        networkFeeIndex: 0,
        index: 0,
        active: true,
        balance: 1000n,
      }

      await expect(
        cloneProxy
          .connect(otherAccount)
          .withdrawFromSSV(100n, [1n, 2n, 3n, 4n], [cluster])
      ).to.be.revertedWithCustomError(
        cloneProxy,
        "CallerNeitherOperatorNorOwner"
      )
    })
  })
})
