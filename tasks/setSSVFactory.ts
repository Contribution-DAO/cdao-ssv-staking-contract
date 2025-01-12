import { task } from "hardhat/config"
import { readDeployment } from "./utils/saveDeployment"

task(
  "setSSVFactory",
  "Set the SSV Factory for the Deposit Proxy and Reference Fee Manager"
).setAction(async (_, hre) => {
  // Triggering compilation
  await hre.run("compile")
  const { ethers } = hre

  const [deployer] = await hre.ethers.getSigners()
  console.log(`Deploying contracts with the account:${deployer.address}`)

  const contracts = await readDeployment(
    Number((await ethers.provider.getNetwork()).chainId)
  )

  const gatewayEth2Deposit = await ethers.getContractAt(
    "GatewayEth2Deposit",
    contracts.GatewayEth2Deposit
  )

  // Set new operator
  console.log("========= Setting SSV Factory on Deposit Proxy ===========")
  await gatewayEth2Deposit.setSSVProxyFactory(contracts.SSVProxyFactory)
})
