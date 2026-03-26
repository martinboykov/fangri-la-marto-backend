import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { storefrontQuery } from '../utils/shopify-storefront';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, firstName, lastName } = req.body as {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const createMutation = `
    mutation customerCreate($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        customer {
          id
          email
          firstName
          lastName
        }
        customerUserErrors {
          code
          field
          message
        }
      }
    }
  `;

  try {
    const createData = await storefrontQuery<{
      customerCreate: {
        customer: { id: string; email: string; firstName?: string; lastName?: string } | null;
        customerUserErrors: { code: string; field: string[]; message: string }[];
      };
    }>(createMutation, { input: { email, password, firstName, lastName } });

    if (createData.customerCreate.customerUserErrors.length > 0) {
      res.status(422).json({ errors: createData.customerCreate.customerUserErrors });
      return;
    }

    const customer = createData.customerCreate.customer!;

    // Immediately issue a token so the user is logged in without email verification step
    const tokenMutation = `
      mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
        customerAccessTokenCreate(input: $input) {
          customerAccessToken {
            accessToken
            expiresAt
          }
          customerUserErrors {
            code
            message
          }
        }
      }
    `;

    const tokenData = await storefrontQuery<{
      customerAccessTokenCreate: {
        customerAccessToken: { accessToken: string; expiresAt: string } | null;
        customerUserErrors: { code: string; message: string }[];
      };
    }>(tokenMutation, { input: { email, password } });

    if (
      tokenData.customerAccessTokenCreate.customerUserErrors.length > 0 ||
      !tokenData.customerAccessTokenCreate.customerAccessToken
    ) {
      // Account created but could not auto-login (e.g. email verification required)
      res.status(201).json({ customer });
      return;
    }

    const shopifyToken = tokenData.customerAccessTokenCreate.customerAccessToken;
    const secret = process.env.JWT_SECRET!;

    const jwtToken = jwt.sign(
      { customerAccessToken: shopifyToken.accessToken, email },
      secret,
      { expiresIn: '30d' }
    );

    res.status(201).json({ customer, token: jwtToken, expiresAt: shopifyToken.expiresAt });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const mutation = `
    mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
      customerAccessTokenCreate(input: $input) {
        customerAccessToken {
          accessToken
          expiresAt
        }
        customerUserErrors {
          code
          field
          message
        }
      }
    }
  `;

  try {
    const data = await storefrontQuery<{
      customerAccessTokenCreate: {
        customerAccessToken: { accessToken: string; expiresAt: string } | null;
        customerUserErrors: { code: string; message: string }[];
      };
    }>(mutation, { input: { email, password } });

    if (data.customerAccessTokenCreate.customerUserErrors.length > 0) {
      res.status(401).json({ errors: data.customerAccessTokenCreate.customerUserErrors });
      return;
    }

    const shopifyToken = data.customerAccessTokenCreate.customerAccessToken!;
    const secret = process.env.JWT_SECRET!;

    const jwtToken = jwt.sign(
      { customerAccessToken: shopifyToken.accessToken, email },
      secret,
      { expiresIn: '30d' }
    );

    res.json({ token: jwtToken, expiresAt: shopifyToken.expiresAt });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/auth/logout
router.delete('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  const mutation = `
    mutation customerAccessTokenDelete($customerAccessToken: String!) {
      customerAccessTokenDelete(customerAccessToken: $customerAccessToken) {
        deletedAccessToken
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    await storefrontQuery(mutation, { customerAccessToken: req.customer!.customerAccessToken });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const query = `
    query customer($customerAccessToken: String!) {
      customer(customerAccessToken: $customerAccessToken) {
        id
        email
        firstName
        lastName
        phone
        createdAt
        defaultAddress {
          id
          address1
          address2
          city
          province
          country
          zip
          phone
        }
      }
    }
  `;

  try {
    const data = await storefrontQuery<{ customer: unknown }>(query, {
      customerAccessToken: req.customer!.customerAccessToken,
    });
    res.json(data.customer);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
