import { expect } from "chai"
import { ethers } from "hardhat"
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { deployContractsFixture } from "./fixtures/deployContracts"
import {
  SSVProxy,
  SSVProxyFactory,
  FeeManagerFactory,
  GatewayEth2Deposit,
  ISSVViews,
  ISSVNetwork,
  MockSSVToken,
} from "../typechain-types"
import { defaultClientBasisPoints, maxSSVTokenPerValidator } from "./constants"
import { addressToWithdrawalCredentials } from "./helpers"

describe("Holesky Integration Tests", () => {
  // Contract instances
  let ssvProxy: SSVProxy
  let ssvProxyFactory: SSVProxyFactory
  let feeManagerFactory: FeeManagerFactory
  let gatewayEth2Deposit: GatewayEth2Deposit
  let ssvViews: ISSVViews
  let ssvNetwork: ISSVNetwork
  let ssvToken: MockSSVToken

  // Signers
  let owner: any
  let client: any
  let referrer: any
  let operator: any
  let otherAccount: any

  // Constants for Holesky testnet
  const HOLESKY_SSV_TOKEN = "0xad45A78180961079BFaeEe349704F411dfF947C6"
  const HOLESKY_SSV_NETWORK = "0x38A4794cCEd47d3baf7370CcC43B560D3a1beEFA"
  const HOLESKY_SSV_VIEWS = "0x352A18AEe90cdcd825d1E37d9939dCA86C00e281"

  beforeEach(async () => {
    const fixture = await loadFixture(deployContractsFixture)
    ssvProxyFactory = fixture.ssvProxyFactory
    feeManagerFactory = fixture.feeManagerFactory
    gatewayEth2Deposit = fixture.gatewayEth2Deposit
    ssvProxy = fixture.ssvProxy
    owner = fixture.owner
    await ethers.provider.send("hardhat_impersonateAccount", [
      "0xbadfeba60d2dea5b8f31b6ec6b930898304a4558",
    ])
    await ethers.provider.send("hardhat_setBalance", [
      "0xbadfeba60d2dea5b8f31b6ec6b930898304a4558",
      "0x21e19e0c9bab2400000", // 10000 ETH in hex
    ])
    client = await ethers.getSigner(
      "0xbadfeba60d2dea5b8f31b6ec6b930898304a4558"
    )
    referrer = fixture.referrer
    operator = fixture.operator
    otherAccount = fixture.otherAccount

    // Get SSV views contract
    ssvViews = await ethers.getContractAt("ISSVViews", HOLESKY_SSV_VIEWS)
    ssvNetwork = await ethers.getContractAt("ISSVNetwork", HOLESKY_SSV_NETWORK)
    ssvToken = await ethers.getContractAt("MockSSVToken", HOLESKY_SSV_TOKEN)

    // Get SSV Token And Transfer to SSVProxy Contract
    // Impersonate SSV token holder
    await ethers.provider.send("hardhat_impersonateAccount", [
      "0x929C3Ed3D1788C4862E6b865E0E02500DB8Fd760",
    ])
    await ethers.provider.send("hardhat_setBalance", [
      "0x929C3Ed3D1788C4862E6b865E0E02500DB8Fd760",
      "0x21e19e0c9bab2400000", // 10000 ETH
    ])
    const ssvHolder = await ethers.getSigner(
      "0x929C3Ed3D1788C4862E6b865E0E02500DB8Fd760"
    )
    await ssvToken
      .connect(ssvHolder)
      .transfer(owner.address, ethers.parseEther("1000"))

    // Get SSV Token And Transfer to SSVProxy Contract
    await ssvToken.transfer(
      await ssvProxyFactory.getAddress(),
      ethers.parseEther("1000")
    )
  })

  describe("SSV Network Integration", () => {
    const setupParams = async () => {
      const withdrawalCredentials = addressToWithdrawalCredentials(
        client.address
      )
      const clientConfig = {
        recipient: client.address,
        basisPoints: 9000,
      }
      const noReferrerConfig = {
        recipient: ethers.ZeroAddress,
        basisPoints: 0,
      }
      const ref5Config = {
        recipient: referrer.address,
        basisPoints: 500,
      }
      const ethAmountPerValidator = ethers.parseEther("32")
      const eth5ValBal = ethers.parseEther("160")

      return {
        withdrawalCredentials,
        clientConfig,
        noReferrerConfig,
        ref5Config,
        ethAmountPerValidator,
        eth5ValBal,
      }
    }

    const setupMakeBeaconDeposit = () => {
      // Make Beacon Deposit Data
      const depositData1Validator = {
        signatures: [
          "0xa3bf531fd1d58bc697fb1242972981e039a217c40257003c29d068074c0b678e3436a52431dc1e1c7a1f7496ec3dfa5f179936c0a2175ed1c8c4dcc440c2f4efe15e6912fc291537dec75fc88fefdf4a262b5cdd0a9da1bff1010d33ee6198b5",
        ],
        depositDataRoots: [
          "0x746242404015e2df531de1c267663ea72006cecd73efcd9b851cfb3f0f2e3f5d",
        ],
      }
      const operatorIds1Validator = [848, 1376, 1377, 1378]
      const pubkeys1Validator = [
        "0x80ad085cf6321e728f89cee64cc0f99cfc4926592ae4e5aed110e4ab09fcecd9844de5b3cdbfd29ed5d6e293591745f4",
      ]
      const sharesData1Validator = [
        "0x95e9413fe405f43b1cf44a781d787ca6adad9fffed02762859fc13cb007f0886161380f88d025cd36a698bb4f1c8ba5e0a6f20272faefe5805225b21daa0439a3e5336121537d0749edb872d3648ba74202b57c5ec5dcc4789ebcb8c4e369a168e6bd696ec71873f62249c7d135742c35277dd89d7026ed366584da149d5ab6e52199a0a28ee02e80ad92b79f0d8eae2b1bef35b4969faa5bb600e6b5dd944a1a860bde3f3fd95332341ae2699da39b33a130343beea2a8f13b824efd1b9e9c6a4857eb6f4393823d96f7731ed113a7de24b32da717b6430e44a08f5f2f5e3be113505ccde6d91dafb2bdaee5b30cfa6a9cc1c0be3535afa6aeed5c69d9b5bdc1b60be342df99b9e3230acea7adeb57f9c5bdda98795418ac66ec6371182b566b62870058ff21b2b42b182cd61fabd7462ba26a3a0ef7e33979104c667373f38c96161a3bbae688067b8ddb5a9b11828ef7232fb0be984feadafe90f5d301ae4adbb483d1e45d68de5f791a5aafe79b959198cf8e61adac12f7766b08bc3b3aa46265bef1be8042b324e464f11ae7569ce6258085ce4ae0b7b7ece300a6307269b48273d0003719409c6ff32b0c2e55cf63796ebd63169047f928d2392b9d429dfa7a6d14c586574fa09609a5103708ffdc5c7e59ee48c4778d926980fef3f2d4e683f6011238b299440fe8bcc223de945e164260780d8cbaea99af0552bfcd210a8e4d7f73c22ae53206e0fb523f25e9d44ff601b1f87a2f2e0eb792b7cb8303c3e03e868fa8a2033422dc38f5858d3df3ea179780fd0d282112003636681cc9a56c52e4f7a4a505f08e2ba3c2c883d0bc800463c8018a4539e969c35043265c7fbbfc3deafe6ff41c878c043eaf3d114df4a212f1acdfec839ad9cbddcd8bfdcae13c5955510024f912cc5112cb8b6a4e00952ada86a1b9acba0788040bfa6f8d9744a4edb3be8906ec9dd47a119635a8045bef78fdca3ab340c1bb2c389c9c52f32c8948dc6b17fed26f132df733b0649e53dc094fda9bd7b20fb6e916dd9d3b1cde0a7186d070aefa90ddd816e068cd603a0b8740ec05452a8c47343dc0ae590367d49b3c175ae9fa2b1d684b85cd9ce14d4eedba80a906d9e264b4e433965e3ec035d610db2d2187e6a3923798721dbd70c78434e9604f4153e639abec4b129ce6ffff2db2029de9c144f6d8896a6722743bf9bb802f0b09fa1f22e4e45c5401420cf3bc16a70a4f97d6a37bf89186134ea7d3b97fdc998854f59fca42648b4bd8d38c16f5f153f552e9c0c45cccfaceecfc8c60b5513ba592a4f8185251d7d8c47208fc0d43d335b3384854d4202a33f46bde531fd1973c1070bccbce156fed9609424cd0cfb4d0ed1138855a699560a871e40665efed941ad0c2b422ecccf205f0e3441f1077b021b4e98b80976a647bdb9bc99f3ad051203d01bf5f3dd5b24a2330c47654c563e127d1a0e7f330ccd35c93691d598ebb23245464b85b498e0aa329d2f25e2271c7cab07d95ebd627bedfe6da3a1dd99d3cedc29c06c4d0960ac662a2d4edb42decd52c1877d376526e8a1ab5d0ceba5fc653e6ef3c40fb0f5bb7dd0f656512e555bfa44315b88ef5a02bbeedc44df6d8bcc2d7e86268da4d7b82443cf7277a4b34e6ad7315674718e7b4afc5be2ef7df9a6e3d02ebfd9470494f9c3b7251d64a4c9fc0e03bada7a6f6c4a7aef150dc163c777019f2fa95f0171c3cd1daf9b1f07d8e211f8175e0332738d08920c1616293e6d9e661c19117bbaf2e39a2e2261a7cdd1fcfa4913000e4b14158b0497b90383b6cc4b3bd0b71ed54d55f66e0b76646339715834bf2fa4b39c9acdded84645a3c98012ff",
      ]
      const cluster = {
        validatorCount: 3,
        networkFeeIndex: 98727854464,
        index: 30147095944,
        active: true,
        balance: 19981901128000000000n,
      }

      return {
        depositData1Validator,
        operatorIds1Validator,
        pubkeys1Validator,
        sharesData1Validator,
        cluster,
      }
    }

    it("should add eth with 1 validator by client", async () => {
      const {
        withdrawalCredentials,
        clientConfig,
        noReferrerConfig,
        ethAmountPerValidator,
      } = await setupParams()
      expect(
        await ssvProxyFactory
          .connect(client)
          .addEth(
            withdrawalCredentials,
            ethAmountPerValidator,
            clientConfig,
            noReferrerConfig,
            "0x",
            { value: ethAmountPerValidator }
          )
      ).to.be.emit(ssvProxyFactory, "EthAdded")
    })

    it("should add eth with 1 validator by operator", async () => {
      const {
        withdrawalCredentials,
        clientConfig,
        noReferrerConfig,
        ethAmountPerValidator,
      } = await setupParams()
      expect(
        await ssvProxyFactory
          .connect(operator)
          .addEth(
            withdrawalCredentials,
            ethAmountPerValidator,
            clientConfig,
            noReferrerConfig,
            "0x",
            { value: ethAmountPerValidator }
          )
      ).to.be.emit(ssvProxyFactory, "EthAdded")
    })

    it("should add eth with 5 validator by client", async () => {
      const {
        withdrawalCredentials,
        clientConfig,
        noReferrerConfig,
        ethAmountPerValidator,
      } = await setupParams()

      expect(
        await ssvProxyFactory
          .connect(client)
          .addEth(
            withdrawalCredentials,
            ethAmountPerValidator,
            clientConfig,
            noReferrerConfig,
            "0x",
            { value: ethAmountPerValidator * 5n }
          )
      ).to.be.emit(ssvProxyFactory, "EthAdded")
    })

    it("should add eth with 5 validator by operator", async () => {
      const {
        withdrawalCredentials,
        clientConfig,
        noReferrerConfig,
        ethAmountPerValidator,
      } = await setupParams()
      expect(
        await ssvProxyFactory
          .connect(operator)
          .addEth(
            withdrawalCredentials,
            ethAmountPerValidator,
            clientConfig,
            noReferrerConfig,
            "0x",
            { value: ethAmountPerValidator * 5n }
          )
      ).to.be.emit(ssvProxyFactory, "EthAdded")
    })

    it("should make beacon deposit with 1 validator by client", async () => {
      const {
        withdrawalCredentials,
        clientConfig,
        noReferrerConfig,
        ethAmountPerValidator,
      } = await setupParams()

      const {
        depositData1Validator,
        operatorIds1Validator,
        pubkeys1Validator,
        sharesData1Validator,
        cluster,
      } = setupMakeBeaconDeposit()

      const tx = await ssvProxyFactory
        .connect(operator)
        .addEth(
          withdrawalCredentials,
          ethAmountPerValidator,
          clientConfig,
          noReferrerConfig,
          "0x",
          { value: ethAmountPerValidator }
        )

      const receipt = await tx.wait()
      const event: any = receipt?.logs[0]
      const feeManagerAddress = event?.address

      expect(
        await ssvProxyFactory
          .connect(operator)
          .makeBeaconDepositsAndRegisterValidators(
            withdrawalCredentials,
            ethAmountPerValidator,
            feeManagerAddress,
            depositData1Validator,
            operatorIds1Validator,
            pubkeys1Validator,
            sharesData1Validator,
            ethers.parseEther("10"),
            cluster
          )
      ).to.be.emit(ssvProxyFactory, "RegistrationCompleted")
    })
  })
})
