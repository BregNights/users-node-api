import { DatabasePostgres } from "../database/queries.postgres.js";
import bcrypt from "bcryptjs";
import { authenticateUser } from "../services/auth.service.user.js";
import { generateToken } from "../utils/jwtUtils.js";
import { isValidUserId, isAuthorizedUser } from "../utils/validators.js";

export const database = new DatabasePostgres();

export async function registerUser(request, reply) {
  try {
    const { name, email, password } = request.body;

    const hashedPassword = bcrypt.hashSync(password, 10);
    await database.create({
      name,
      email,
      password: hashedPassword,
    });

    return reply.status(201).send({ message: "Usuário criado com sucesso!" });
  } catch (error) {
    console.error("Erro ao registrar usuário:", error);
    return reply.status(500).send({ error: "Erro interno do servidor" });
  }
}

export async function loginUser(request, reply) {
  try {
    const { email, password } = request.body;

    const result = await authenticateUser(email, password);

    if (result.error) {
      return reply.status(401).send({ message: result.error });
    }

    const token = generateToken(result);

    return reply.status(200).send({ token });
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    return reply.status(500).send({ error: "Erro interno do servidor" });
  }
}

export async function getUser(request, reply) {
  try {
    const userId = request.user.id;
    const result = await isValidUserId(userId);
    if (result.error) {
      return reply.status(404).send({ message: result.error });
    }

    const user = {
      id: result.id,
      name: result.name,
      email: result.email,
    };

    return reply.status(200).send(user);
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);
    return reply.status(500).send({ error: "Erro interno do servidor" });
  }
}

export async function editUser(request, reply) {
  try {
    const userId = request.params.id;

    const result = await isValidUserId(userId);
    if (result.error) {
      return reply.status(404).send({ message: result.error });
    }

    const userIdToken = request.user.id;

    const authorizedUser = isAuthorizedUser(userId, userIdToken);
    if (authorizedUser.error) {
      return reply.status(401).send({ message: authorizedUser.error });
    }

    const { name, password } = request.body;
    const hashedPassword = bcrypt.hashSync(password, 10);

    await database.update(userId, {
      name,
      password: hashedPassword,
    });

    return reply.status(200).send({ message: "Usuário editado com sucesso!" });
  } catch (error) {
    console.error("Erro ao editar usuário:", error);
    return reply.status(500).send({ error: "Erro interno do servidor" });
  }
}

export async function deleteUser(request, reply) {
  try {
    const userId = request.params.id;

    const existsId = await database.findById(userId);
    if (!existsId) {
      return reply.status(404).send({ error: "Usuário não encontrado" });
    }

    const userIdToken = request.user.id;
    if (String(userIdToken) !== String(userId)) {
      return reply.status(401).send({
        error: "Ação não permitida.",
      });
    }

    await database.delete(userId);
    return reply.status(200).send({ message: "Usuário Excluido com sucesso!" });
  } catch (error) {
    console.error("Erro ao excluir usuário:", error);
    return reply.status(500).send({ error: "Erro interno do servidor" });
  }
}

export async function addProduct(request, reply) {
  try {
    const { name, price, stock } = request.body;
    if (!name || price == null || stock == null) {
      return reply
        .status(400)
        .send({ message: "Todos os campos são obrigatórios" });
    }

    if (typeof price !== "number" || price <= 0) {
      return reply.status(400).send({ message: "Preço inválido" });
    }

    if (!Number.isInteger(stock) || stock < 0) {
      return reply.status(400).send({ message: "Estoque inválido" });
    }

    await database.registerProduct({
      name,
      price,
      stock,
    });

    return reply.status(201).send({
      message: "Produto adicionado com sucesso!",
    });
  } catch (error) {
    console.error("Erro ao adicionar produto:", error);
    return reply.status(500).send({ error: "Erro interno do servidor" });
  }
}

export async function getProducts(request, reply) {
  try {
    const maxLimit = 100;
    const { page = 1, limit = 10 } = request.query;
    const products = await database.getProducts({
      page: parseInt(page),
      limit: Math.min(parseInt(limit), maxLimit),
    });
    return reply.status(200).send({
      products,
    });
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    return reply.status(500).send({ error: "Erro interno do servidor" });
  }
}
export async function addOrder(request, reply) {
  try {
    const userId = request.user.id;
    const { status = "pending", products } = request.body;

    let total_price = 0;

    const order = await database.addOrder({ user_id: userId, status });

    for (const product of products) {
      if (!product.id || !product.quantity || product.quantity <= 0) {
        return reply
          .status(400)
          .send({ message: "Produto inválido ou quantidade incorreta" });
      }

      const dbProduct = await database.getProductById(product.id);

      if (!dbProduct) {
        return reply
          .status(404)
          .send({ message: `Produto ID ${product.id} não encontrado` });
      }

      if (dbProduct.stock < product.quantity) {
        return reply
          .status(400)
          .send({ message: `Estoque insuficiente para ${dbProduct.name}` });
      }

      const itemTotal = dbProduct.price * product.quantity;
      total_price += itemTotal;

      const productPrice = await database.getProductPrice(product.id);

      await database.addOrderItem({
        order_id: order.id,
        product_id: product.id,
        quantity: product.quantity,
        price: productPrice,
      });

      await database.updateProductStock({
        product_id: dbProduct.id,
        quantity: product.quantity,
      });
    }

    return reply.status(201).send({
      message: "Pedido criado com sucesso!",
      order_id: order.id,
      total_price,
    });
  } catch (error) {
    console.error("Erro ao processar pedido:", error);
    return reply.status(500).send({ error: "Erro interno do servidor" });
  }
}

export async function getOrders(request, reply) {
  try {
    const userId = request.user.id;
    const orderId = await database.getOrderId(userId);
    if (!orderId) {
      return reply
        .status(400)
        .send({ message: "Não há pedidos em sua conta." });
    }
    const getItems = await database.getItems(orderId.id);
    return reply.status(200).send({ getItems });
  } catch (error) {
    console.error("Erro na consulta dos pedidos:", error);
    return reply.status(500).send({ error: "Erro interno do servidor" });
  }
}
