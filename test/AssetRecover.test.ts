import { expect } from "chai"
import { ethers } from "hardhat"
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers"
import {
  MockERC20,
  MockERC721,
  MockERC1155,
  FeeManagerFactory,
} from "../typechain-types"

describe("Asset Recovery", () => {
  let owner: SignerWithAddress
  let user: SignerWithAddress
  let assetRecover: FeeManagerFactory
  let mockERC20: MockERC20
  let mockERC721: MockERC721
  let mockERC1155: MockERC1155

  beforeEach(async () => {
    ;[owner, user] = await ethers.getSigners()

    // Deploy mock tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20")
    mockERC20 = (await MockERC20Factory.deploy(
      "Mock Token",
      "MTK"
    )) as MockERC20

    const MockERC721Factory = await ethers.getContractFactory("MockERC721")
    mockERC721 = (await MockERC721Factory.deploy(
      "Mock NFT",
      "MNFT"
    )) as MockERC721

    const MockERC1155Factory = await ethers.getContractFactory("MockERC1155")
    mockERC1155 = (await MockERC1155Factory.deploy()) as MockERC1155

    // Deploy test implementation of OwnableAssetRecover
    const TestAssetRecoverFactory = await ethers.getContractFactory(
      "FeeManagerFactory"
    )
    assetRecover = (await TestAssetRecoverFactory.deploy(
      9000
    )) as FeeManagerFactory
  })

  describe("ETH Recovery", () => {
    const amount = ethers.parseEther("1.0")

    beforeEach(async () => {
      // Set ETH to the contract
      await ethers.provider.send("hardhat_setBalance", [
        await assetRecover.getAddress(),
        "0x21e19e0c9bab2400000", // 10000 ETH in hex
      ])
    })

    it("should allow owner to recover ETH", async () => {
      const initialBalance = await ethers.provider.getBalance(user.address)

      await assetRecover.connect(owner).transferEther(user.address, amount)

      const finalBalance = await ethers.provider.getBalance(user.address)
      expect(finalBalance - initialBalance).to.equal(amount)
    })

    it("should revert when non-owner tries to recover ETH", async () => {
      await expect(
        assetRecover.connect(user).transferEther(user.address, amount)
      ).to.be.revertedWithCustomError(assetRecover, "CallerNotOwner")
    })
  })

  describe("ERC20 Recovery", () => {
    const amount = ethers.parseUnits("100", 18)

    beforeEach(async () => {
      await mockERC20.mint(await assetRecover.getAddress(), amount)
    })

    it("should allow owner to recover ERC20 tokens", async () => {
      await assetRecover
        .connect(owner)
        .transferERC20(await mockERC20.getAddress(), user.address, amount)

      const balance = await mockERC20.balanceOf(user.address)
      expect(balance).to.equal(amount)
    })

    it("should revert when non-owner tries to recover ERC20", async () => {
      await expect(
        assetRecover
          .connect(user)
          .transferERC20(await mockERC20.getAddress(), user.address, amount)
      ).to.be.revertedWithCustomError(assetRecover, "CallerNotOwner")
    })
  })

  describe("ERC721 Recovery", () => {
    const tokenId = 1

    beforeEach(async () => {
      await mockERC721.mint(await assetRecover.getAddress(), tokenId)
    })

    it("should allow owner to recover ERC721 tokens", async () => {
      await assetRecover
        .connect(owner)
        .transferERC721(await mockERC721.getAddress(), user.address, tokenId)

      const tokenOwner = await mockERC721.ownerOf(tokenId)
      expect(tokenOwner).to.equal(user.address)
    })

    it("should revert when non-owner tries to recover ERC721", async () => {
      await expect(
        assetRecover
          .connect(user)
          .transferERC721(await mockERC721.getAddress(), user.address, tokenId)
      ).to.be.revertedWithCustomError(assetRecover, "CallerNotOwner")
    })
  })
})
