# SSVProxyFactory Contract Documentation

## Overview

The SSVProxyFactory contract is the entry point for SSV validator registration and management. It deploys and manages SSVProxy instances, handles validator registration with the SSV network, and coordinates with other core contracts in the system.

## Key Features

- Deploys and manages SSVProxy instances
- Handles validator registration with SSV network
- Manages SSV token operations
- Controls access to SSV network functions
- Provides deterministic address prediction

## Contract Inheritance

- OwnableAssetRecover
- OwnableWithOperator
- ERC165
- ISSVProxyFactory

## State Variables

- `_ssvNetwork`: Immutable SSVNetwork contract reference
- `_depositContract`: Immutable Beacon Deposit Contract reference
- `_gatewayEth2Deposit`: Immutable GatewayEth2Deposit reference
- `_feeManagerFactory`: Immutable FeeManagerFactory reference
- `_ssvToken`: Immutable SSV token (ERC-20) reference
- `_ssvViews`: Immutable SSVViews contract reference
- `_referenceFeeManager`: Template for new FeeManager instances
- `_referenceSSVProxy`: Template for new SSVProxy instances
- `_allowedSsvOperatorOwners`: Set of allowed SSV operator owners
- `_allClientSsvProxies`: Mapping of client addresses to their SSVProxy instances
- `_deployedSsvProxies`: Mapping to track deployed SSVProxy instances
- `_clientSelectors`: Mapping of allowed function selectors for clients
- `_operatorSelectors`: Mapping of allowed function selectors for operators

## Key Functions

### Constructor

```solidity
constructor(
    address gatewayEth2Deposit_,
    address feeManagerFactory_,
    address referenceFeeManager_,
    address depositContract_,
    address ssvNetwork_,
    address ssvViews_,
    address ssvToken_
)
```

Initializes the factory with all necessary contract references.

### createSSVProxy

```solidity
function createSSVProxy(
    address _feeManagerInstance
) external returns (address ssvProxyInstance)
```

Creates a new SSVProxy instance for a given FeeManager.

### predictSSVProxyAddress

```solidity
function predictSSVProxyAddress(
    address _feeManagerInstance
) public view returns (address)
```

Predicts the address where a SSVProxy will be deployed.

### makeBeaconDepositsAndRegisterValidators

```solidity
function makeBeaconDepositsAndRegisterValidators(
    bytes32 _eth2WithdrawalCredentials,
    uint96 _ethAmountPerValidatorInWei,
    address _feeManagerInstance,
    DepositData calldata _depositData,
    uint64[] calldata _operatorIds,
    bytes[] calldata _publicKeys,
    bytes[] calldata _sharesData,
    uint256 _amount,
    ISSVNetwork.Cluster calldata _cluster
) external returns (address ssvProxy)
```

Handles the complete process of depositing ETH and registering validators.

## Events

- `SSVProxyCreated`
- `EthForSsvStakingDeposited`
- `RegistrationCompleted`
- `ReferenceFeeManagerSet`
- `ReferenceSSVProxySet`
- `MaxSsvTokenAmountPerValidatorSet`

## Access Control

- Owner controls reference contract settings
- Operator and owner can create SSVProxy instances
- Selective function access for clients and operators

## Integration Points

- Works with GatewayEth2Deposit for ETH deposits
- Integrates with FeeManagerFactory for fee management
- Connects with SSVNetwork for validator operations
- Manages SSV token operations

## Security Considerations

- Uses deterministic deployment addresses
- Implements role-based access control
- Validates contract interfaces using ERC165
- Controls maximum SSV token amounts
- Maintains whitelisting for SSV operator owners
