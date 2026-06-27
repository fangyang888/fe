import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { CartItem } from '../cart/cart-item.entity';
import { Product } from '../product/product.entity';
import { OrderService } from './order.service';
import { PayService } from './pay.service';
import { OrderController } from './order.controller';
import { OrderAdminController } from './order-admin.controller';
import { AddressModule } from '../address/address.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, CartItem, Product]),
    AddressModule,
  ],
  controllers: [OrderController, OrderAdminController],
  providers: [OrderService, PayService],
  exports: [OrderService],
})
export class OrderModule {}
