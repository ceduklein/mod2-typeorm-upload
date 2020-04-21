import { getRepository, In, getCustomRepository } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';

import Transaction from '../models/Transaction';
import Category from '../models/Category';
import TransactionsRepository from '../repositories/TransactionsRepository';

interface TransactionCSV {
  title: string;
  value: number;
  type: 'income' | 'outcome';
  category: string;
}
class ImportTransactionsService {
  public async execute(filePath: string): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    // Constante que faz a leitura do arquivo, informado no filePath
    const contactsReadStream = fs.createReadStream(filePath);

    // instancia o csvParce, que possui inúmeras funções
    const parsers = csvParse({
      // Determina leitura do csv a partir da linha 2
      from_line: 2,
    });

    // faz a leitura das linhas disponíveis
    const parseCSV = contactsReadStream.pipe(parsers);

    // cria arrays vazios com as respectivas tipagens
    const transactions: TransactionCSV[] = [];
    const categories: string[] = [];

    // vai desestruturar cada célula da linha, conforme propriedades abaixo
    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      // Caso algum desses valores não seja informado na tabela, retorna
      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    /* new Promisse, para determinar que antes de continuar o código,
    deve ser aguaradada a resolução e o retorno do parsCSV acima */
    await new Promise(resolve => parseCSV.on('end', resolve));

    // procura se alguma das categorias já existe na DB
    const existentCategories = await categoriesRepository.find({
      where: { title: In(categories) },
    });

    // Verifica no próprio csv se existem duas categorias iguais
    const existentCategoriesTitle = existentCategories.map(
      (category: Category) => category.title,
    );
    const addCategoryTitles = categories
      .filter(category => !existentCategoriesTitle.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    // Instancia e salva as categorias não existentes e não duplicadas
    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );
    await categoriesRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existentCategories];

    // Instancia e salva as transações
    const createdTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );
    await transactionsRepository.save(createdTransactions);
    await fs.promises.unlink(filePath);

    return createdTransactions;
  }
}
export default ImportTransactionsService;
