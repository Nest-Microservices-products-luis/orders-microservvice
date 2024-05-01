import { OrderStatus } from "@prisma/client";

export interface OrderWithProducts  {
    OrderItem: {
        name: any;
        productId: number;
        quantiy: number;
        price: number;
    }[];
    id: string;
    totalAmount: number;
    totalItems: number;
    status: OrderStatus;
    paid: boolean;
    paidAt: Date;
    createdAt: Date;
    updatedAt: Date;
}