const bre = require('@nomiclabs/buidler')

async function main () {
  // await bre.run('compile');
  const OptionFactory = await ethers.getContractFactory('OptionFactory')
  const factory = await OptionFactory.deploy()

  await factory.deployed()

  console.log('Factory deployed to:', factory.address)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
