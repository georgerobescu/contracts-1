// SPDX-License-Identifier: MIT
pragma solidity ^0.6.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IUniswapV1.sol";
import "./interfaces/IPodPut.sol";

/**
 * Represents a Proxy that can mint and sell on the behalf of a Option Seller,
 * alternatively it can buy to a Option Buyer
 */
contract OptionExchange {
    IUniswapFactory public uniswapFactory;

    event OptionsBought(
        address indexed buyer,
        address indexed optionAddress,
        uint256 optionsBought,
        address inputToken,
        uint256 inputSold
    );

    event OptionsSold(
        address indexed seller,
        address indexed optionAddress,
        uint256 optionsSold,
        address outputToken,
        uint256 outputBought
    );

    constructor (address _uniswapFactoryAddress) public {
        uniswapFactory = IUniswapFactory(_uniswapFactoryAddress);
    }

    modifier withinDeadline(uint256 deadline) {
        require(deadline > block.timestamp, "Transaction timeout");
        _;
    }

    /**
     * Mints an amount of options and sell it in liquidity provider
     * @notice Mint and sell options
     *
     * @param option The option contract to mint
     * @param optionAmount Amount of options to mint
     * @param outputToken The token which the premium will be paid
     * @param minOutputAmount Minimum amount of output tokens accepted
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     */
    function sellOptions(
        IPodPut option,
        uint256 optionAmount,
        address outputToken,
        uint256 minOutputAmount,
        uint256 deadline
    ) external withinDeadline(deadline) {
        uint256 strikeToTransfer = option.strikeToTransfer(optionAmount);

        IERC20 strikeAsset = IERC20(option.strikeAsset());
        require(
            strikeAsset.transferFrom(msg.sender, address(this), strikeToTransfer),
            "Could not transfer strike tokens from caller"
        );

        address optionAddress = address(option);

        strikeAsset.approve(optionAddress, strikeToTransfer);
        option.mint(optionAmount, msg.sender);

        IUniswapExchange optionExchange = getExchange(optionAddress);

        uint256 minEthBought = 1;

        try
            optionExchange.tokenToTokenTransferInput(
                optionAmount,
                minOutputAmount,
                minEthBought,
                deadline,
                msg.sender,
                outputToken
            )
        returns (uint256 tokensBought) {
            emit OptionsSold(msg.sender, optionAddress, optionAmount, outputToken, tokensBought);
        } catch {
            revert("Uniswap trade failed");
        }
    }

    /**
     * Buys an amount of options from liquidity provider
     * @notice Buy exact amount of options
     *
     * @param option The option contract to buy
     * @param optionAmount Amount of options to buy
     * @param inputToken The token spent to buy options
     * @param maxInputAmount Max amount of input tokens sold
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     */
    function buyExactOptions(
        IPodPut option,
        uint256 optionAmount,
        address inputToken,
        uint256 maxInputAmount,
        uint256 deadline
    ) external withinDeadline(deadline) {
        address optionAddress = address(option);

        IUniswapExchange optionExchange = getExchange(optionAddress);

        uint256 maxEthSold = 1;

        try
            optionExchange.tokenToTokenTransferOutput(
                optionAmount,
                maxInputAmount,
                maxEthSold,
                deadline,
                msg.sender,
                inputToken
            )
        returns (uint256 tokensSold) {
            emit OptionsBought(msg.sender, optionAddress, optionAmount, inputToken, tokensSold);
        } catch {
            revert("Uniswap trade failed");
        }
    }

    /**
     * Buys an estimated amount of options from liquidity provider
     * @notice Buy estimated amount of options
     *
     * @param option The option contract to buy
     * @param minOptionAmount Min amount of options bought
     * @param inputToken The token spent to buy options
     * @param inputAmount The exact amount of input tokens sold
     * @param deadline The deadline in unix-timestamp that limits the transaction from happening
     */
    function buyOptionsWithExactTokens(
        IPodPut option,
        uint256 minOptionAmount,
        address inputToken,
        uint256 inputAmount,
        uint256 deadline
    ) external withinDeadline(deadline) {
        address optionAddress = address(option);

        IUniswapExchange optionExchange = getExchange(inputToken);

        uint256 minEthBought = 1;

        try
            optionExchange.tokenToTokenTransferInput(
                inputAmount,
                minOptionAmount,
                minEthBought,
                deadline,
                msg.sender,
                optionAddress
        )
        returns (uint256 optionsBought) {
            emit OptionsBought(msg.sender, optionAddress, optionsBought, inputToken, inputAmount);
        } catch {
            revert("Uniswap trade failed");
        }
    }

    /**
     * Returns the Uniswap Exchange associated with the token address
     *
     * @param tokenAddress An address of token to be traded
     * @return IUniswapExchange
     */
    function getExchange(address tokenAddress) internal view returns(IUniswapExchange) {
        address exchangeOptionAddress = uniswapFactory.getExchange(tokenAddress);
        require(exchangeOptionAddress != address(0), "Exchange not found");
        return IUniswapExchange(exchangeOptionAddress);
    }
}
