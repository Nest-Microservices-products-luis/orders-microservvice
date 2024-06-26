import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { PaidOrderDto, changeOrderStatusDto } from './dto';
import { NATS_SERVICES, PRODUCT_SERVICE } from 'src/config/services';
import { firstValueFrom } from 'rxjs';
import { OrderWithProducts } from './interfaces/order-with-products.interface';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
 
 private readonly logger = new Logger('OrdersService');

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }
  constructor(@Inject(NATS_SERVICES) private readonly client: ClientProxy) {
    super();
  } 

  
  
  async create(createOrderDto: CreateOrderDto) {

    try {
      //1 confirmar ids de los productos
      const productsId = createOrderDto.items.map(item => item.productId);
      const products: any[] = await firstValueFrom(
        this.client.send({cmd: 'validate_producs'}, productsId)
       )
    //2 calculo de los valores
    const totalAmount = createOrderDto.items.reduce((acc, orderItem)=>{
      const price = products.find(
        (product) => product.id === orderItem.productId,
      ).price;
      return (price * orderItem.quantity) + acc;
    },0);

    const totalItems = createOrderDto.items.reduce((acc, orderItem)=>{
      return acc + orderItem.quantity;
    },0)

    //3. crear transaccion base de datos
    const order = await this.order.create({
      data:{
        totalAmount:totalAmount,
        totalItems: totalItems,
        OrderItem:{
          createMany:{
          data: createOrderDto.items.map((orderItem)=> ({
            price: products.find(product => product.id === orderItem.productId).price,
            productId:orderItem.productId,
            quantiy:orderItem.quantity
          }))
          }
        }
      },
      include:{
        OrderItem: {
          select: {
            price: true,
            quantiy: true,
            productId: true
          }
        }
      }
    });

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find(product => product.id === orderItem.productId).name
        }))
      };
    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Checks logs'
      })
    }
   
    // return this.order.create({
    //   data: createOrderDto
    // });
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    
    const totalPages = await this.order.count({
      where:{
        status: orderPaginationDto.status
      }
    });
    
    const currentPage = orderPaginationDto.page;
    const perPage = orderPaginationDto.limit;
    return {
      data: await this.order.findMany({
        skip: (currentPage - 1) * perPage,
        take: perPage,
        where:{
          status: orderPaginationDto.status
        }
      }),
      meta:{
        total: totalPages,
        page: currentPage,
        lastPage: Math.ceil(totalPages/perPage)
      }
    }
    
    return this.order.findMany({});
  }

  async findOne(id: string) {
    const order = await this.order.findFirst({
      where: {
        id: id
      },
      include: {
        OrderItem:{
          select: {
            price: true,
            quantiy: true,
            productId: true
          }
        }
      }
    });
    if(!order){
      throw new RpcException({
        status : HttpStatus.NOT_FOUND,
        message: `Order with id ${id} not dound`
      })
    }
    const productsId =  await order.OrderItem.map((orderItem) => orderItem.productId);

    const products: any[] = await firstValueFrom(
      this.client.send({cmd: 'validate_producs'}, productsId)
     )

    return {
      ...order,
      OrderItem: order.OrderItem.map(orderItem =>({
        ...orderItem,
        name: products.find(product => product.id === orderItem.productId ).name
      }))


    };
  }


  async changeStatus(changeOrderStatusDto: changeOrderStatusDto){
    const {id, status} = changeOrderStatusDto;
    const order = await this.findOne(id);
    if(order.status === status){
      return order;
    }
    return this.order.update({
      where: {id},
      data:{
        status: status
      }
    });

  }


  async createPaymentSession(order: OrderWithProducts){
    const paymentSession = await firstValueFrom(
      this.client.send('create.payment.session',{
        orderId: order.id,
        currency: 'usd',
        items: order.OrderItem.map(item => ({
          name: item.name,
          price: item.price,
          quantity: item.quantiy
        }))
      })
    )
    return paymentSession;
  }

  async paidOrder(paidorderDto: PaidOrderDto){
    this.logger.log('OrderPaid');
    this.logger.log(paidorderDto)
    const order = await this.order.update({
      where: {id: paidorderDto.orderId},
      data:{
        status: 'PAID',
        paid: true,
        paidAt: new Date(),
        stripeChargeId: paidorderDto.stripePaymentId,

        //relacion
        OrderReceipt:{
          create: {
            receiptUrl: paidorderDto.receiptUrl
          }
        }
      }
    });
      
    return order;
  }
}
