import { expect } from "chai"
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { deployContractsFixture } from "./fixtures/deployContracts"
import { SSVProxy, SSVProxyFactory } from "../typechain-types"

describe("SSVProxy", () => {
  let ssvProxy: SSVProxy
  let ssvProxyFactory: SSVProxyFactory
  let owner: any
  let operator: any
  let otherAccount: any

  beforeEach(async () => {
    const fixture = await loadFixture(deployContractsFixture)
    ssvProxy = fixture.ssvProxy
    ssvProxyFactory = fixture.ssvProxyFactory
    owner = fixture.owner
    operator = fixture.operator
    otherAccount = fixture.otherAccount
  })

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

  describe("Access Control", () => {
    describe("onlyOperatorOrOwner", () => {
      it("should allow owner to withdraw SSV tokens", async () => {
        await expect(
          ssvProxy.connect(owner).withdrawSSVTokens(owner.address, 0)
        ).to.not.be.revertedWithCustomError(
          ssvProxy,
          "CallerNeitherOperatorNorOwner"
        )
      })

      it("should allow operator to withdraw SSV tokens", async () => {
        await expect(
          ssvProxy.connect(operator).withdrawAllSSVTokensToFactory()
        ).to.not.be.revertedWithCustomError(
          ssvProxy,
          "CallerNeitherOperatorNorOwner"
        )
      })

      it("should revert when non-operator/owner tries to withdraw SSV tokens", async () => {
        await expect(
          ssvProxy.connect(otherAccount).withdrawAllSSVTokensToFactory()
        ).to.be.revertedWithCustomError(
          ssvProxy,
          "CallerNeitherOperatorNorOwner"
        )
      })
    })
  })
})
