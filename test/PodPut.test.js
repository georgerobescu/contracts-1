const { expect } = require('chai')
const provider = waffle.provider

const OPTION_TYPE_PUT = 0

const fixtures = {
  scenarioA: {
    underlyingAssetSymbol: 'WBTC',
    underlyingAssetDecimals: 8,
    strikeAssetSymbol: 'USDC',
    strikeAssetDecimals: 6,
    strikePrice: (5000e6).toString(),
    strikePriceDecimals: 6,
    expirationDate: 900000,
    initialSellerUnderlyingAmount: (1e8).toString(),
    initialSellerStrikeAmount: (5000e6).toString(),
    amountToMint: 1e8,
    amountToMintTooLow: 1,
    balanceOfContractAfterMint: 1e18,
    balanceOfStrikeAfterMint: 120e6,
    balanceOfUnderlyingAfterMint: 0,
    amountToExercise: 1e18,
    balanceOfUnderlyingAfterExercise: 1e18,
    balanceOfStrikeAfterExercise: 0,
    amountOfStrikeToWithdraw: 0,
    amountOfUnderlyingToWithdraw: 1e18
  }
}

describe('PodPut Contract', () => {
  let mockUnderlyingAsset
  let mockStrikeAsset
  let factoryContract
  let podPut
  let deployer
  let deployerAddress
  let seller
  let sellerAddress
  let buyer
  let buyerAddress

  before(async function () {
    [deployer, seller, buyer] = await ethers.getSigners()
    deployerAddress = await deployer.getAddress()
    sellerAddress = await seller.getAddress()
    buyerAddress = await buyer.getAddress()

    // 1) Deploy Factory
    const ContractFactory = await ethers.getContractFactory('OptionFactory')
    factoryContract = await ContractFactory.deploy()
    await factoryContract.deployed()
  })

  beforeEach(async function () {
    // const podPut = await ethers.getContractFactory('podPut')
    const MockERC20 = await ethers.getContractFactory('MintableERC20')

    mockUnderlyingAsset = await MockERC20.deploy(fixtures.scenarioA.underlyingAssetSymbol, fixtures.scenarioA.underlyingAssetSymbol, fixtures.scenarioA.underlyingAssetDecimals)
    mockStrikeAsset = await MockERC20.deploy(fixtures.scenarioA.strikeAssetSymbol, fixtures.scenarioA.strikeAssetSymbol, fixtures.scenarioA.strikeAssetDecimals)

    await mockUnderlyingAsset.deployed()
    await mockStrikeAsset.deployed()

    // call transaction
    const txIdNewOption = await factoryContract.createOption(
      'pod:WBTC:USDC:5000:A',
      'pod:WBTC:USDC:5000:A',
      OPTION_TYPE_PUT,
      mockUnderlyingAsset.address,
      mockStrikeAsset.address,
      fixtures.scenarioA.strikePrice,
      await provider.getBlockNumber() + 3000, // expirationDate = high block number
      mockUnderlyingAsset.address
    )

    const filterFrom = await factoryContract.filters.OptionCreated(deployerAddress)
    const eventDetails = await factoryContract.queryFilter(filterFrom, txIdNewOption.blockNumber, txIdNewOption.blockNumber)

    if (eventDetails.length) {
      const { option } = eventDetails[0].args
      podPut = await ethers.getContractAt('PodPut', option)
    } else {
      console.log('Something went wrong: No events found')
    }

    await podPut.deployed()
  })

  describe('Constructor/Initialization checks', () => {
    it('Should have correct number of decimals for underlying and strike asset', async () => {
      expect(await podPut.strikeAssetDecimals()).to.equal(fixtures.scenarioA.strikeAssetDecimals)
      expect(await podPut.underlyingAssetDecimals()).to.equal(fixtures.scenarioA.underlyingAssetDecimals)
    })

    it('PodPut and underlyingAsset should have equal number of decimals', async () => {
      expect(await podPut.decimals()).to.equal(fixtures.scenarioA.underlyingAssetDecimals)
    })

    it('StrikePrice and strikeAsset should have equal number of decimals', async () => {
      expect(await podPut.strikePriceDecimals()).to.equal(await podPut.strikeAssetDecimals())
    })
  })

  describe('Minting options', () => {
    it('Should not mint if user dont have enough collateral', async () => {
      expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

      await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)

      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
      await expect(podPut.connect(seller).mint(fixtures.scenarioA.amountToMint)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
    })

    it('Should not mint if user do not approve collateral to be spended by podPut', async () => {
      expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

      await mockStrikeAsset.connect(seller).mint(fixtures.scenarioA.strikePrice)

      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(fixtures.scenarioA.strikePrice)

      await expect(podPut.connect(seller).mint(fixtures.scenarioA.amountToMint)).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
    })

    it('Should not mint if asked amount is too low', async () => {
      const minimumAmount = ethers.BigNumber.from(fixtures.scenarioA.strikePrice).div(10 ** await mockUnderlyingAsset.decimals())

      if (minimumAmount.gt(0)) return

      expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

      await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
      await mockStrikeAsset.connect(seller).mint(fixtures.scenarioA.strikePrice)

      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(fixtures.scenarioA.strikePrice)
      await expect(podPut.connect(seller).mint(fixtures.scenarioA.amountToMintTooLow)).to.be.revertedWith('amount too low')
    })

    it('Should mint, increase option balance to the sender and decrease collateral', async () => {
      expect(await podPut.balanceOf(sellerAddress)).to.equal(0)

      await mockStrikeAsset.connect(seller).approve(podPut.address, ethers.constants.MaxUint256)
      await mockStrikeAsset.connect(seller).mint(fixtures.scenarioA.strikePrice)

      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(fixtures.scenarioA.strikePrice)
      await podPut.connect(seller).mint(fixtures.scenarioA.amountToMint)
      expect(await podPut.balanceOf(sellerAddress)).to.equal(fixtures.scenarioA.amountToMint)
      expect(await mockStrikeAsset.balanceOf(sellerAddress)).to.equal(0)
    })
  })
})