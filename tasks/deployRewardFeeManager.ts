import { task, types } from "hardhat/config"

task("deploy:rewardFeeManager", "Deploy a new RewardFeeManager contract")
  .addParam(
    "feeManagerFactory",
    "Address of FeeManagerFactory Contract",
    undefined,
    types.string
  )
  .addParam(
    "service",
    "Address of service fee recipient",
    undefined,
    types.string
  )
  .addOptionalParam(
    "updateReference",
    "Update reference in SSVProxyFactory",
    false,
    types.boolean
  )
  .addOptionalParam(
    "ssvProxyFactory",
    "Address of SSVProxyFactory (required if updateReference=true)",
    undefined,
    types.string
  )
  .setAction(
    async ({ feeManagerFactory, service, updateReference, ssvProxyFactory }, hre) => {
      console.log("========= Deploying RewardFeeManager ===========")

      const [deployer] = await hre.ethers.getSigners()
      console.log(`Deploying with account: ${deployer.address}`)

      const RewardFeeManager =
        await hre.ethers.getContractFactory("RewardFeeManager")
      const rewardFeeManager = await RewardFeeManager.deploy(
        feeManagerFactory,
        service
      )
      await rewardFeeManager.waitForDeployment()

      const rewardFeeManagerAddr = await rewardFeeManager.getAddress()
      console.log("RewardFeeManager deployed at:", rewardFeeManagerAddr)
      console.log("Constructor args:")
      console.log("  feeManagerFactory:", feeManagerFactory)
      console.log("  service:", service)

      if (updateReference) {
        if (!ssvProxyFactory) {
          throw new Error(
            "ssvProxyFactory address is required when updateReference is true"
          )
        }

        console.log("========= Updating reference in SSVProxyFactory ===========")
        const factory = await hre.ethers.getContractAt(
          "SSVProxyFactory",
          ssvProxyFactory
        )
        const tx = await factory.setReferenceFeeManager(rewardFeeManagerAddr)
        await tx.wait()
        console.log("Reference updated successfully")
        console.log("Transaction hash:", tx.hash)
      }

      return rewardFeeManagerAddr
    }
  )

task("verify:rewardFeeManager", "Verify RewardFeeManager contract on Etherscan")
  .addParam(
    "address",
    "Address of deployed RewardFeeManager",
    undefined,
    types.string
  )
  .addParam(
    "feeManagerFactory",
    "Address of FeeManagerFactory",
    undefined,
    types.string
  )
  .addParam(
    "service",
    "Address of service fee recipient",
    undefined,
    types.string
  )
  .setAction(async ({ address, feeManagerFactory, service }, hre) => {
    console.log("========= Verifying RewardFeeManager ===========")
    console.log("Contract address:", address)
    console.log("Constructor args:")
    console.log("  feeManagerFactory:", feeManagerFactory)
    console.log("  service:", service)

    await hre.run("verify:verify", {
      address,
      constructorArguments: [feeManagerFactory, service],
    })

    console.log("RewardFeeManager verified successfully")
  })
