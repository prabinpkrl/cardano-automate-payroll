const { runPayroll } = require("./payroll");

// Example payroll list
const payrollList = [
  {
    address:
      "addr_test1qzgk7wvlzhznk4knyyq0tp3nj0ee82hc5maz2d2uqr4xtplyxuq6n9etd9ajlplj8ufr2jcgklgrmleajdh6zcnj8k5s9r40ue",
    amount: 1_500_000n,
  },
  {
    address:
      "addr_test1qrfqjrzyxsjf8uszfdewzql7w2aa8k5ww63ppks50qfge4ffm0hx6rrrnhsqyxxs6e6sceqzxzfgaq5j9pfqrdz7wm3qj5w797",
    amount: 2_000_000n,
  },
];
async function startPayroll() {
  await runPayroll(payrollList);
}

module.exports = { startPayroll };
