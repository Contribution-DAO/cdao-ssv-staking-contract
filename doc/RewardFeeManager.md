# RewardFeeManager Contract Documentation

## Overview

The RewardFeeManager contract is responsible for accepting and splitting Execution Layer (EL) rewards between service providers, clients, and referrers. It extends the base FeeManager contract and implements specific reward distribution logic.

## Key Features

- Accepts EL rewards
- Splits rewards according to predefined basis points
- Handles reward distribution between service, client, and referrer
- Implements reentrancy protection
- Supports emergency fund recovery

## Contract Inheritance

- FeeManager
- ReentrancyGuard
- ERC165
- OwnableTokenRecover

## State Variables

Inherits all state variables from FeeManager:

- `_factory`: Immutable FeeManagerFactory reference
- `_service`: Immutable service fee recipient address
- `_clientConfig`: Client rewards recipient and basis points
- `_referrerConfig`: Referrer rewards recipient and basis points
- `_ssvProxyFactory`: SSVProxyFactory reference

## Key Functions

### Constructor

```solidity
constructor(
    address _factory,
    address payable _service
)
```

Initializes the contract with factory and service fee recipient addresses.

### withdraw

```solidity
function withdraw() external nonReentrant
```

Distributes the contract's entire balance according to predefined basis points:

- Service receives base amount minus client and referrer shares
- Client receives their percentage based on basis points
- Referrer (if set) receives their percentage based on basis points

## Access Control

- Only client or operator can trigger withdrawals
- Inherits access control from FeeManager

## Events

- `Withdrawn(uint256 serviceAmount, uint256 clientAmount, uint256 referrerAmount)`

## Integration Points

- Works with SSVProxyFactory for operator validation
- Integrates with FeeManagerFactory for deployment
- Handles ETH rewards from validator operations

## Security Considerations

- Uses ReentrancyGuard for withdrawal protection
- Implements safe ETH transfer handling
- Supports emergency fund recovery through OwnableTokenRecover
- Validates recipient addresses can receive ETH
- Handles failed ETH transfers gracefully
- Implements basis points validation
- Enforces proper initialization checks
