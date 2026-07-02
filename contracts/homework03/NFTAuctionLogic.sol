// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

/**
 * @title NFT Auction
 * @author LunaZou
 */
contract NFTAuctionLogic is
    ReentrancyGuard,
    UUPSUpgradeable,
    OwnableUpgradeable,
    /**
     * @notice ERC721Holder 是一个用于接收 ERC721 代币的合约。它实现了 IERC721Receiver 接口，使得合约能够安全地接收 ERC721 代币。
     * @dev 继承 ERC721Holder 可以让拍卖合约在拍卖过程中接收和持有 NFT，确保在拍卖结束后能够将 NFT 转移给最高出价者。
     */
    ERC721Holder
{
    using SafeERC20 for IERC20;

    /**
     * @notice 拍卖结构体
     */
    struct Auction {
        address seller; // 卖家地址
        address nftContract; // NFT 合约地址
        uint256 tokenId; // NFT tokenId
        uint256 startingPrice; // 起拍价
        address bidToken; // 接受的 ERC20 代币地址（如果是 ETH，则为 address(0)）
        uint256 highestBid; // 最高出价
        address highestBidder; // 最高出价者
        uint256 endTime; // 拍卖结束时间
        bool active; // 拍卖是否活跃
    }

    // 拍卖映射
    mapping(uint256 => Auction) public auctions; // 拍卖 ID 到拍卖结构体的映射
    uint256 public auctionCount; // 拍卖计数器

    // 待退款映射（用于结束拍卖后退还之前的出价）
    mapping(address => mapping(uint256 => uint256)) public pendingReturns; // 用户地址到待退款金额的映射

    // 需要支持多个价格预言机，使用映射存储不同的预言机地址
    mapping(address => AggregatorV3Interface) public priceFeeds; // 代币地址到 Chainlink 价格预言机的映射

    // 保留空间，用于未来升级时添加新的状态变量，避免存储冲突
    uint256[50] private __gap;

    /**
     * @notice 拍卖创建事件
     */
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 startingPrice,
        address bidToken,
        uint256 endTime
    );

    /**
     * @notice 出价成功事件
     */
    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 bidAmount
    );

    /**
     * @notice 拍卖结束事件
     */
    event AuctionEnded(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 finalPrice
    );

    /**
     * @notice 构造函数
     */
    constructor() {
        // 防止有人直接调逻辑合约的 initialize 方法
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address _ethUsdPriceFeed
    ) external initializer {
        __Ownable_init(initialOwner); // 初始化 OwnableUpgradeable
        priceFeeds[address(0)] = AggregatorV3Interface(_ethUsdPriceFeed); // 初始化 Chainlink 价格预言机
    }

    /**
     * @notice 创建拍卖
     * @param  nftContract NFT 合约地址
     * @param  tokenId NFT tokenId
     * @param  startingPrice 起拍价
     * @param  duration 拍卖持续时间（秒）
     * @return 拍卖 ID
     */
    function createAuction(
        address nftContract,
        uint256 tokenId,
        uint256 startingPrice,
        address bidToken,
        uint256 duration
    ) external nonReentrant returns (uint256) {
        require(duration > 0, "Duration must be greater than 0");
        require(startingPrice > 0, "Starting price must be greater than 0");
        require(
            nftContract != address(0),
            "NFT contract address cannot be zero"
        );

        IERC721 nft = IERC721(nftContract);

        require(
            nft.ownerOf(tokenId) == msg.sender,
            "You must own the NFT to create an auction"
        );
        require(
            nft.isApprovedForAll(msg.sender, address(this)) ||
                nft.getApproved(tokenId) == address(this),
            "Contract must be approved to transfer the NFT"
        );

        nft.safeTransferFrom(msg.sender, address(this), tokenId);

        auctionCount++;
        uint256 auctionId = auctionCount;
        auctions[auctionId] = Auction({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            startingPrice: startingPrice,
            bidToken: bidToken,
            highestBid: 0,
            highestBidder: address(0),
            endTime: block.timestamp + duration,
            active: true
        });

        emit AuctionCreated(
            auctionId,
            msg.sender,
            nftContract,
            tokenId,
            startingPrice,
            bidToken,
            block.timestamp + duration
        );

        return auctionId;
    }

    /**
     * @notice 出价
     * @param auctionId 拍卖 ID
     * @notice 使用 nonReentrant 修饰符防止重入攻击
     *
     */
    function placeBid(
        uint256 auctionId,
        address bidToken,
        uint256 amount
    ) external payable nonReentrant {
        Auction memory auction = auctions[auctionId];

        require(
            auction.bidToken == bidToken,
            "Bid token does not match auction"
        );
        require(auction.active, "Auction is not active");
        require(block.timestamp < auction.endTime, "Auction has already ended");

        uint256 bidAmount = bidToken == address(0) ? msg.value : amount;
        require(
            bidAmount > auction.highestBid &&
                bidAmount >= auction.startingPrice,
            "Bid must be higher than the current highest bid and starting price"
        );

        // pull ERC20 token if bidToken is not ETH
        if (bidToken != address(0)) {
            IERC20(bidToken).safeTransferFrom(
                msg.sender,
                address(this),
                bidAmount
            );
        }

        // 如果有之前的最高出价者，将其出价退还
        if (auction.highestBidder != address(0)) {
            if (bidToken != address(0)) {
                IERC20(bidToken).safeTransfer(
                    auction.highestBidder,
                    auction.highestBid
                );
            } else {
                (bool success, ) = auction.highestBidder.call{
                    value: auction.highestBid
                }("");
                require(success, "Failed to transfer funds to previous bidder");
            }
        }

        // 更新拍卖的最高出价和最高出价者
        auctions[auctionId].highestBid = bidAmount;
        auctions[auctionId].highestBidder = msg.sender;

        emit BidPlaced(auctionId, msg.sender, bidAmount);
    }

    /**
     * @notice 结束拍卖
     * @param auctionId 拍卖 ID
     *
     */
    function endAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];

        require(auction.active, "Auction is not active");
        require(
            block.timestamp >= auction.endTime,
            "Auction has not ended yet"
        );

        auction.active = false;

        if (auction.highestBidder != address(0)) {
            // 将 NFT 从拍卖合约转移给最高出价者（NFT 在创建拍卖时已转到合约）
            IERC721(auction.nftContract).safeTransferFrom(
                address(this),
                auction.highestBidder,
                auction.tokenId
            );

            // 将拍卖金额转给卖家
            if (auction.bidToken != address(0)) {
                IERC20(auction.bidToken).safeTransfer(
                    auction.seller,
                    auction.highestBid
                );
            } else {
                (bool success, ) = auction.seller.call{
                    value: auction.highestBid
                }("");
                require(success, "Failed to transfer funds to seller");
            }
        }

        // 如果没有出价者，NFT 仍然归卖家所有
        // 卖家可以选择重新上架拍卖或保留 NFT
        emit AuctionEnded(auctionId, auction.highestBidder, auction.highestBid);
    }

    /**
     * @notice 提取待退款金额
     * @param auctionId 拍卖 ID
     */
    function withdrawBid(uint256 auctionId) external nonReentrant {
        uint256 amount = pendingReturns[msg.sender][auctionId];
        require(amount > 0, "No funds to withdraw");
        pendingReturns[msg.sender][auctionId] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Failed to withdraw funds");
    }

    /**
     * @notice 查询拍卖信息
     * @param auctionId 拍卖 ID
     * @return seller 卖家地址
     * @return nftContract NFT 合约地址
     * @return tokenId NFT tokenId
     * @return startingPrice 起拍价
     * @return bidToken 接受的 ERC20 代币地址（address(0) 表示 ETH）
     * @return highestBid 最高出价
     * @return highestBidder 最高出价者
     * @return endTime 拍卖结束时间
     * @return active 拍卖是否活跃
     */
    function getAuction(
        uint256 auctionId
    )
        external
        view
        returns (
            address seller,
            address nftContract,
            uint256 tokenId,
            uint256 startingPrice,
            address bidToken,
            uint256 highestBid,
            address highestBidder,
            uint256 endTime,
            bool active
        )
    {
        Auction memory auction = auctions[auctionId];
        return (
            auction.seller,
            auction.nftContract,
            auction.tokenId,
            auction.startingPrice,
            auction.bidToken,
            auction.highestBid,
            auction.highestBidder,
            auction.endTime,
            auction.active
        );
    }

    // @notice 为指定代币注册 Chainlink 价格预言机
    function setTokenPriceFeed(address token, address feed) external onlyOwner {
        require(feed != address(0), "Feed address cannot be zero");
        priceFeeds[token] = AggregatorV3Interface(feed);
    }

    // 给 upgrade 操作加权限锁
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    // @notice 获取当前 ETH/USD 价格，使用 Chainlink 价格预言机
    function getEthUsdPrice(address bidToken) public view returns (int256) {
        AggregatorV3Interface feed = priceFeeds[bidToken];
        require(address(feed) != address(0), "Price feed not set for token");
        (, int256 price, , uint256 updatedAt, ) = feed.latestRoundData();
        require(price > 0, "Invalid price from price feed");
        require(block.timestamp - updatedAt < 1 hours, "Price feed is stale");
        return price;
    }

    // @notice 获取代币的小数位数，ETH（address(0)）为 18
    function _getTokenDecimals(address token) internal view returns (uint8) {
        if (token == address(0)) return 18;
        (bool success, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        require(success, "Failed to get token decimals");
        return abi.decode(data, (uint8));
    }

    // @notice 将代币金额转换为 USD（8位小数）
    function tokenToUsd(
        uint256 amount,
        address token
    ) public view returns (uint256) {
        uint256 price = uint256(getEthUsdPrice(token));
        uint8 decimals = _getTokenDecimals(token);
        return (amount * price) / (10 ** decimals);
    }

    // @notice 查询指定拍卖的最高出价的 USD 价值
    function getHighestBidInUSD(
        uint256 auctionId
    ) external view returns (uint256) {
        Auction memory auction = auctions[auctionId];
        return tokenToUsd(auction.highestBid, auction.bidToken);
    }
}
