
module.exports = {
  'GET /demo.json': function(req, res) {
    res.json({ success: true });
  },
  'GET /demo2.json': { data: 'demo2' },
  'GET /demo3.json': 'http://www.baidu.com',
};
