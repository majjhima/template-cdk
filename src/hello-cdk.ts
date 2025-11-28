const greeting = process.env.GREETING;

export const handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify(greeting),
  };
};
