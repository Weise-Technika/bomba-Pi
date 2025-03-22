import express from 'express';
import Hello from './routes/hello.js';
import one2carRoutes from "./routes/one2car.js";
import taladrodRoutes from "./routes/taladrod.js";
import mottoAuction from './routes/motto-auction.js';


// import prices from './routes/prices.js';
// import car4cash from './routes/car4cash.js';
// import getPrice from './routes/getPrice.js';
// import motto from './routes/motto.js';
// import roddonjai from './routes/roddonjai.js';

const app = express();
const port = 3001;

app.use(express.json());
app.use('/', Hello);
app.use("/one2car", one2carRoutes);
app.use("/taladrod", taladrodRoutes);
app.use('/motto-auction', mottoAuction);

// app.use('/api', prices);
// app.use('/update-car4cash', car4cash);
// app.use('/get-price', getPrice);
// app.use('/motto', motto);
// app.use('/roddonjai', roddonjai);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port} 🚀`);
});

