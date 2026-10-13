import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class SelectDirectionsDto {
  @ArrayMinSize(1, { message: "Kamida bitta yo'nalish tanlang" })
  @ArrayMaxSize(2, { message: "Ko'pi bilan 2 ta yo'nalish tanlash mumkin" })
  @ArrayUnique()
  @IsUUID('all', { each: true })
  directionIds!: string[];
}

export class StartPlacementDto {
  @IsIn(['CLAIMED', 'UNKNOWN'])
  mode!: 'CLAIMED' | 'UNKNOWN';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  levelOrd?: number;
}

export class AnswerDto {
  @IsUUID('all')
  questionId!: string;

  @IsInt()
  @Min(0)
  @Max(3)
  choice!: number;
}
