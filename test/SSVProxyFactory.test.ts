import { expect } from "chai"
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { SSVProxyFactory, FeeManagerFactory } from "../typechain-types"
import { deployContractsFixture } from "./fixtures/deployContracts"
import { defaultClientBasisPoints, maxSSVTokenPerValidator } from "./constants"

describe("SSVProxyFactory", () => {
  let ssvProxyFactory: SSVProxyFactory
  let feeManagerFactory: FeeManagerFactory
  let owner: any
  let client: any
  let referrer: any
  let operator: any
  let otherAccount: any

  beforeEach(async () => {
    const fixture = await loadFixture(deployContractsFixture)
    ssvProxyFactory = fixture.ssvProxyFactory
    feeManagerFactory = fixture.feeManagerFactory
    owner = fixture.owner
    client = fixture.client
    referrer = fixture.referrer
    operator = fixture.operator
    otherAccount = fixture.otherAccount
  })

  describe("Initialization", () => {
    it("should set the correct owner", async () => {
      expect(await ssvProxyFactory.owner()).to.equal(owner.address)
    })

    it("should set the correct operator", async () => {
      expect(await ssvProxyFactory.operator()).to.equal(operator.address)
    })

    it("should set the correct fee manager factory", async () => {
      expect(await ssvProxyFactory.getFeeManagerFactory()).to.equal(
        await feeManagerFactory.getAddress()
      )
    })
  })

  describe("Max Token Amount Configuration", () => {
    it("should allow owner to set max SSV token amount per validator", async () => {
      const newMax = BigInt(maxSSVTokenPerValidator) * 2n
      await ssvProxyFactory
        .connect(owner)
        .setMaxSsvTokenAmountPerValidator(newMax)
      expect(await ssvProxyFactory.getMaxSsvTokenAmountPerValidator()).to.equal(
        newMax
      )
    })

    it("should revert when non-owner tries to set max token amount", async () => {
      await expect(
        ssvProxyFactory
          .connect(otherAccount)
          .setMaxSsvTokenAmountPerValidator(maxSSVTokenPerValidator)
      ).to.be.revertedWithCustomError(ssvProxyFactory, "CallerNotOwner")
    })

    it("should revert when setting invalid max token amount", async () => {
      const invalidAmount = 10n ** 11n // Too small
      await expect(
        ssvProxyFactory
          .connect(owner)
          .setMaxSsvTokenAmountPerValidator(invalidAmount)
      ).to.be.revertedWithCustomError(
        ssvProxyFactory,
        "MaxSsvTokenAmountPerValidatorOutOfRange"
      )
    })
  })

  describe("SSV Proxy Management", () => {
    it("should create SSV proxy with correct configuration", async () => {
      const clientConfig = {
        recipient: client.address,
        basisPoints: defaultClientBasisPoints,
      }
      const referrerConfig = {
        recipient: referrer.address,
        basisPoints: 500n,
      }

      // Create fee manager first
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

      // Create SSV proxy
      await expect(
        ssvProxyFactory.connect(operator).createSSVProxy(feeManagerAddress)
      ).to.emit(ssvProxyFactory, "SSVProxyCreated")

      const clientProxies = await ssvProxyFactory.getAllClientSsvProxies(
        client.address
      )
      expect(clientProxies.length).to.equal(1)
    })

    it("should track all client SSV proxies", async () => {
      const clientConfig1 = {
        recipient: client.address,
        basisPoints: defaultClientBasisPoints,
      }
      const clientConfig2 = {
        recipient: client.address,
        basisPoints: 9500n,
      }
      const referrerConfig = {
        recipient: referrer.address,
        basisPoints: 500n,
      }

      // Create first proxy
      const tx1 = await feeManagerFactory
        .connect(owner)
        .createFeeManager(
          await ssvProxyFactory.getReferenceFeeManager(),
          clientConfig1,
          referrerConfig
        )
      const receipt1 = await tx1.wait()
      const event1: any = receipt1?.logs[0]
      await ssvProxyFactory.connect(operator).createSSVProxy(event1?.address)

      // Create second proxy
      const tx2 = await feeManagerFactory
        .connect(owner)
        .createFeeManager(
          await ssvProxyFactory.getReferenceFeeManager(),
          clientConfig2,
          referrerConfig
        )
      const receipt2 = await tx2.wait()
      const event2: any = receipt2?.logs[0]
      await ssvProxyFactory.connect(operator).createSSVProxy(event2?.address)

      const clientProxies = await ssvProxyFactory.getAllClientSsvProxies(
        client.address
      )
      expect(clientProxies.length).to.equal(2)
    })
  })

  describe("Selector Management", () => {
    const testSelector = "0x12345678"

    it("should allow owner to set allowed client selectors", async () => {
      await ssvProxyFactory
        .connect(owner)
        .setAllowedSelectorsForClient([testSelector])
      expect(await ssvProxyFactory.isClientSelectorAllowed(testSelector)).to.be
        .true
    })

    it("should allow owner to remove allowed client selectors", async () => {
      await ssvProxyFactory
        .connect(owner)
        .setAllowedSelectorsForClient([testSelector])
      await ssvProxyFactory
        .connect(owner)
        .removeAllowedSelectorsForClient([testSelector])
      expect(await ssvProxyFactory.isClientSelectorAllowed(testSelector)).to.be
        .false
    })

    it("should allow owner to set allowed operator selectors", async () => {
      await ssvProxyFactory
        .connect(owner)
        .setAllowedSelectorsForOperator([testSelector])
      expect(await ssvProxyFactory.isOperatorSelectorAllowed(testSelector)).to
        .be.true
    })

    it("should revert when setting empty selector list", async () => {
      await expect(
        ssvProxyFactory.connect(owner).setAllowedSelectorsForClient([])
      ).to.be.revertedWithCustomError(ssvProxyFactory, "CannotSetZeroSelectors")
    })
  })
})
