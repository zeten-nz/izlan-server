import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value);
const trimLines = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v)).filter((v) => v !== '') : value;

export class CreateDirectionDto {
  @Transform(trim)
  @IsString({ message: "Yo'nalish nomini yozing" })
  @IsNotEmpty({ message: "Yo'nalish nomini yozing" })
  @MaxLength(60, { message: "Nom 60 belgidan oshmasin" })
  title!: string;

  @IsIn(['LANGUAGE', 'SUBJECT'], { message: 'Turini tanlang: til yoki fan' })
  kind!: 'LANGUAGE' | 'SUBJECT';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200, { message: "Tavsif 200 belgidan oshmasin" })
  description?: string;
}

export class UpdateDirectionDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "Yo'nalish nomini yozing" })
  @MaxLength(60, { message: "Nom 60 belgidan oshmasin" })
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200, { message: "Tavsif 200 belgidan oshmasin" })
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateLevelDto {
  @Transform(trim)
  @IsString({ message: 'Daraja kodini yozing (masalan A1)' })
  @IsNotEmpty({ message: 'Daraja kodini yozing (masalan A1)' })
  @MaxLength(12, { message: 'Kod 12 belgidan oshmasin' })
  code!: string;

  @Transform(trim)
  @IsString({ message: 'Daraja nomini yozing' })
  @IsNotEmpty({ message: 'Daraja nomini yozing' })
  @MaxLength(60, { message: 'Nom 60 belgidan oshmasin' })
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300, { message: "Qisqa tavsif 300 belgidan oshmasin" })
  summary?: string;

  @IsOptional()
  @Transform(trimLines)
  @IsArray()
  @ArrayMaxSize(12, { message: "'Nimalarni qila oladi' ro'yxati 12 tadan oshmasin" })
  @IsString({ each: true })
  @MaxLength(120, { each: true, message: "Har bir band 120 belgidan oshmasin" })
  canDo?: string[];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200, { message: "Lug'at izohi 200 belgidan oshmasin" })
  vocabHint?: string;
}

export class UpdateLevelDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Daraja kodini yozing (masalan A1)' })
  @MaxLength(12, { message: 'Kod 12 belgidan oshmasin' })
  code?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Daraja nomini yozing' })
  @MaxLength(60, { message: 'Nom 60 belgidan oshmasin' })
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300, { message: "Qisqa tavsif 300 belgidan oshmasin" })
  summary?: string;

  @IsOptional()
  @Transform(trimLines)
  @IsArray()
  @ArrayMaxSize(12, { message: "'Nimalarni qila oladi' ro'yxati 12 tadan oshmasin" })
  @IsString({ each: true })
  @MaxLength(120, { each: true, message: "Har bir band 120 belgidan oshmasin" })
  canDo?: string[];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200, { message: "Lug'at izohi 200 belgidan oshmasin" })
  vocabHint?: string;
}

export class CreateTopicDto {
  @Transform(trim)
  @IsString({ message: 'Mavzu nomini yozing' })
  @IsNotEmpty({ message: 'Mavzu nomini yozing' })
  @MaxLength(100, { message: 'Nom 100 belgidan oshmasin' })
  title!: string;
}

export class UpdateTopicDto {
  @Transform(trim)
  @IsString({ message: 'Mavzu nomini yozing' })
  @IsNotEmpty({ message: 'Mavzu nomini yozing' })
  @MaxLength(100, { message: 'Nom 100 belgidan oshmasin' })
  title!: string;
}

export class ReorderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}
