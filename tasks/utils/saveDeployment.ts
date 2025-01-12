import fs from "fs"
import path from "path"

interface DeploymentInfo {
  chainId: number
  chainName: string
  timestamp: string
  contracts: {
    [key: string]: string
  }
}

export const saveDeployment = async (
  chainId: number,
  chainName: string,
  contracts: { [key: string]: string }
) => {
  const deploymentInfo: DeploymentInfo = {
    chainId,
    chainName,
    timestamp: new Date().toISOString(),
    contracts,
  }

  const deploymentsDir = path.join(process.cwd(), "deployments")
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir)
  }

  const filename = `deployment_${chainId}_${Date.now()}.json`
  const filepath = path.join(deploymentsDir, filename)

  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2))

  console.log(`Deployment info saved to ${filepath}`)
}

export const readDeployment = async (chainId: number) => {
  const deploymentsDir = path.join(process.cwd(), "deployments")
  if (!fs.existsSync(deploymentsDir)) {
    throw new Error("No deployments directory found")
  }

  const files = fs.readdirSync(deploymentsDir)
  const deploymentFiles = files.filter((f) =>
    f.startsWith(`deployment_${chainId}_`)
  )
  if (deploymentFiles.length === 0) {
    throw new Error(`No deployment files found for chain ID ${chainId}`)
  }

  // Sort by timestamp (descending) and get the latest
  const latestFile = deploymentFiles.sort().reverse()[0]
  const filepath = path.join(deploymentsDir, latestFile)
  const deploymentInfo: DeploymentInfo = JSON.parse(
    fs.readFileSync(filepath, "utf8")
  )

  return deploymentInfo.contracts
}
