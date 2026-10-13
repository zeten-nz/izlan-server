import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hashPassword } from '../auth/crypto.util';
import type { RegisterDto } from '../auth/dto';
import { PrismaService } from '../prisma/prisma.service';

/** Ustoz kamida shu yoshda bo'lishi kerak */
const TEACHER_MIN_AGE = 18;

const fail = (status: HttpStatus, errors: Record<string, string>) =>
  new HttpException({ message: Object.values(errors)[0], errors }, status);

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async createTeacher(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) throw fail(HttpStatus.BAD_REQUEST, { confirmPassword: 'Parollar mos kelmadi' });
    if (dto.birthYear > new Date().getFullYear() - TEACHER_MIN_AGE) {
      throw fail(HttpStatus.BAD_REQUEST, { birthYear: `Ustoz kamida ${TEACHER_MIN_AGE} yoshda bo'lishi kerak` });
    }
    const [byEmail, byUsername] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { username: dto.username }, select: { id: true } }),
    ]);
    const taken: Record<string, string> = {};
    if (byEmail) taken.email = 'Bu email bilan hisob allaqachon bor';
    if (byUsername) taken.username = 'Bu username band';
    if (Object.keys(taken).length) throw fail(HttpStatus.CONFLICT, taken);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          username: dto.username,
          firstName: dto.firstName,
          lastName: dto.lastName,
          birthYear: dto.birthYear,
          passwordHash: await hashPassword(dto.password),
          role: 'TEACHER',
          emailVerifiedAt: new Date(),
        },
      });
      return { teacher: { id: user.id, username: user.username, email: user.email, firstName: user.firstName, lastName: user.lastName } };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw fail(HttpStatus.CONFLICT, { username: 'Bu username yoki email band' });
      }
      throw e;
    }
  }
}
