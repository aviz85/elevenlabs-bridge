import { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/lib/supabase'
import { logger } from '@/lib/logger'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Check database connection
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .select('count')
      .limit(1)

    if (error) {
      throw error
    }

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        api: 'running'
      },
      version: '1.0.0'
    }

    logger.info('Health check passed')
    res.status(200).json(health)

  } catch (error) {
    logger.error('Health check failed', error as Error)
    
    const health = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'error',
        api: 'running'
      },
      error: (error as Error).message
    }

    res.status(503).json(health)
  }
}